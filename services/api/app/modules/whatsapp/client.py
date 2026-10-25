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
        return bool(self.token and self.phone_number_id)

    def clean_phone_number(self, phone: str) -> str:
        """Formats phone number into E.164 without '+' (e.g. 919876543210)."""
        digits = "".join(filter(str.isdigit, phone))
        if len(digits) == 10:
            return "91" + digits
        if digits.startswith("0") and len(digits) == 11:
            return "91" + digits[1:]
        return digits

    async def upload_pdf_media(self, pdf_bytes: bytes, filename: str) -> str | None:
        """Uploads document bytes to Meta WhatsApp Cloud Media Storage."""
        if not self.is_configured:
            return None

        url = f"{self.base_url}/media"
        headers = {"Authorization": f"Bearer {self.token}"}
        files = {
            "file": (filename, pdf_bytes, "application/pdf"),
            "messaging_product": (None, "whatsapp"),
            "type": (None, "application/pdf"),
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
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
        """Sends document via Meta WhatsApp Cloud API."""
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

whatsapp_client = WhatsAppCloudClient()