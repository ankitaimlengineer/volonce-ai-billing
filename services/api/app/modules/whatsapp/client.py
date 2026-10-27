import logging
import httpx
from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


class WhatsAppCloudClient:
    def __init__(self):
        self.token = settings.whatsapp_api_token
        self.phone_number_id = settings.whatsapp_phone_number_id
        self.base_url = f"https://graph.facebook.com/v21.0/{self.phone_number_id}"

    @property
    def is_configured(self) -> bool:
        """ચકાસે છે કે Meta WhatsApp Cloud API ના ક્રેડેન્શિયલ્સ સેટ થયેલા છે કે નહીં."""
        return bool(self.token and self.phone_number_id)

    def clean_phone_number(self, phone: str) -> str:
        """ફોન નંબરને E.164 ફોર્મેટમાં ('+' વગર) ફેરવે છે (દા.ત. 919876543210)."""
        digits = "".join(filter(str.isdigit, phone))
        if len(digits) == 10:
            return "91" + digits
        if digits.startswith("0") and len(digits) == 11:
            return "91" + digits[1:]
        return digits

    async def upload_pdf_media(self, pdf_bytes: bytes, filename: str) -> str | None:
        """PDF દસ્તાવેજ Meta WhatsApp Media સર્વર પર અપલોડ કરે છે અને Media ID મેળવે છે."""
        if not self.is_configured:
            logger.warning("WhatsApp API Token અથવા Phone Number ID કન્ફિગર કરેલ નથી.")
            return None

        url = f"{self.base_url}/media"
        headers = {"Authorization": f"Bearer {self.token}"}
        files = {
            "file": (filename, pdf_bytes, "application/pdf"),
            "messaging_product": (None, "whatsapp"),
            "type": (None, "application/pdf"),
        }

        async with httpx.AsyncClient(timeout=25.0) as client:
            try:
                res = await client.post(url, headers=headers, files=files)
                if res.status_code in (200, 201):
                    return res.json().get("id")
                logger.error("Meta Media Upload Error: %s", res.text)
                return None
            except Exception as e:
                logger.error("WhatsApp Media Upload Exception: %s", e)
                return None

    async def send_invoice_document(
        self,
        recipient_phone: str,
        media_id: str,
        filename: str,
        caption: str,
    ) -> dict:
        """PDF દસ્તાવેજ (ઇન્વોઇસ અથવા ખાતાવહી સ્ટેટમેન્ટ) ગ્રાહકના WhatsApp પર મોકલે છે."""
        if not self.is_configured:
            return {"success": False, "error": "WhatsApp API credentials not configured"}

        url = f"{self.base_url}/messages"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": self.clean_phone_number(recipient_phone),
            "type": "document",
            "document": {
                "id": media_id,
                "caption": caption,
                "filename": filename,
            },
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                res = await client.post(url, headers=headers, json=payload)
                data = res.json()
                if res.status_code in (200, 201):
                    return {"success": True, "data": data}
                logger.error("WhatsApp Send Document Error: %s", res.text)
                return {"success": False, "error": data.get("error", {}).get("message", res.text)}
            except Exception as e:
                logger.error("WhatsApp Send Exception: %s", e)
                return {"success": False, "error": str(e)}

    async def send_text_message(
        self,
        recipient_phone: str,
        text_message: str,
    ) -> dict:
        """ગ્રાહકને WhatsApp પર સાદો ટેક્સ્ટ મેસેજ / પેમેન્ટ રીમાઇન્ડર મોકલે છે."""
        if not self.is_configured:
            return {"success": False, "error": "WhatsApp API credentials not configured"}

        url = f"{self.base_url}/messages"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": self.clean_phone_number(recipient_phone),
            "type": "text",
            "text": {
                "preview_url": True,
                "body": text_message,
            },
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                res = await client.post(url, headers=headers, json=payload)
                data = res.json()
                if res.status_code in (200, 201):
                    return {"success": True, "data": data}
                logger.error("WhatsApp Send Text Error: %s", res.text)
                return {"success": False, "error": data.get("error", {}).get("message", res.text)}
            except Exception as e:
                logger.error("WhatsApp Send Text Exception: %s", e)
                return {"success": False, "error": str(e)}


whatsapp_client = WhatsAppCloudClient()