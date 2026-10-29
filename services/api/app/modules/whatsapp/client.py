import logging
import urllib.parse
import httpx
from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


class WhatsAppCloudClient:
    def __init__(self):
        self.token = (settings.whatsapp_api_token or "").strip()
        self.phone_number_id = (settings.whatsapp_phone_number_id or "").strip()
        self.base_url = f"https://graph.facebook.com/v21.0/{self.phone_number_id}"

    @property
    def is_configured(self) -> bool:
        """
        ચકાસે છે કે Meta WhatsApp Cloud API ના અસલ (Real) ક્રેડેન્શિયલ્સ સેટ થયેલા છે કે નહીં.
        જો .env માં હજુ ડમી/પ્લેસહોલ્ડર કી હોય તો આ આપોઆપ False આપશે જેથી સિસ્ટમ અટકે નહીં.
        """
        if not self.token or not self.phone_number_id:
            return False

        # ડમી પ્લેસહોલ્ડર કીઝ ચેક કરો
        dummy_markers = [
            "YourMetaPermanentSystemUserToken",
            "100000000000000",
            "EAAG...YourMetaPermanentSystemUserToken",
            "your_token_here",
        ]
        if any(marker in self.token for marker in dummy_markers) or self.phone_number_id == "100000000000000":
            return False

        return True

    def clean_phone_number(self, phone: str | None) -> str:
        """ફોન નંબરને સાફ કરીને E.164 ફોર્મેટમાં ('+' વગર) ફેરવે છે (દા.ત. 919876543210)."""
        digits = "".join(filter(str.isdigit, str(phone or "")))
        if len(digits) == 10:
            return "91" + digits
        if digits.startswith("0") and len(digits) == 11:
            return "91" + digits[1:]
        return digits

    def get_direct_chat_link(self, phone: str | None, text_message: str) -> str:
        """૧-ક્લિકમાં ડાયરેક્ટ WhatsApp Web / App ખોલવા માટેની યુનિવર્સલ લિંક બનાવે છે."""
        clean = self.clean_phone_number(phone)
        encoded_text = urllib.parse.quote(text_message)
        if clean:
            return f"https://api.whatsapp.com/send?phone={clean}&text={encoded_text}"
        return f"https://api.whatsapp.com/send?text={encoded_text}"

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
                logger.error("Meta Media Upload Error (%s): %s", res.status_code, res.text)
                return None
            except Exception as e:
                logger.error("WhatsApp Media Upload Exception: %s", e)
                return None

    # ---------------- ૧. સામાન્ય ડાયરેક્ટ મેસેજ (૨૪ કલાકની વિન્ડો ચાલુ હોય ત્યારે) ----------------
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

                err_info = data.get("error", {})
                err_code = err_info.get("code")

                # Meta Error Code 131047 = ૨૪ કલાકની વિન્ડો પૂરી થઈ ગઈ છે
                if err_code == 131047:
                    logger.warning("WhatsApp 24-hr window expired for %s. Official Template required.", recipient_phone)
                    return {"success": False, "error": "24h_window_expired", "code": 131047}

                logger.error("WhatsApp Send Document Error: %s", res.text)
                return {"success": False, "error": err_info.get("message", res.text), "code": err_code}
            except Exception as e:
                logger.error("WhatsApp Send Exception: %s", e)
                return {"success": False, "error": str(e)}

    # ---------------- ૨. સત્તાવાર મંજૂર થયેલ ટેમ્પલેટ દ્વારા બિલ PDF મોકલો (24-Hour Bypass) ----------------
    async def send_template_document(
        self,
        recipient_phone: str,
        media_id: str,
        filename: str,
        customer_name: str,
        invoice_number: str,
        grand_total: str,
        store_name: str,
        template_name: str = "volonce_invoice_delivery",
        language_code: str = "gu",
    ) -> dict:
        """
        Meta દ્વારા મંજૂર થયેલ Official Template દ્વારા PDF બિલ મોકલે છે.
        આ મેસેજ ૨૪ કલાક પૂરા થયા પછી પણ ક્યારેય બ્લોક થતો નથી.
        """
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
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
                "components": [
                    {
                        "type": "header",
                        "parameters": [
                            {
                                "type": "document",
                                "document": {
                                    "id": media_id,
                                    "filename": filename,
                                },
                            }
                        ],
                    },
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": str(customer_name or "Customer")},
                            {"type": "text", "text": str(invoice_number)},
                            {"type": "text", "text": str(grand_total)},
                            {"type": "text", "text": str(store_name or "STORE")},
                        ],
                    },
                ],
            },
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                res = await client.post(url, headers=headers, json=payload)
                data = res.json()
                if res.status_code in (200, 201):
                    return {"success": True, "data": data}
                logger.error("WhatsApp Template Send Error: %s", res.text)
                return {"success": False, "error": data.get("error", {}).get("message", res.text)}
            except Exception as e:
                logger.error("WhatsApp Template Send Exception: %s", e)
                return {"success": False, "error": str(e)}

    # ---------------- ૩. સત્તાવાર મંજૂર થયેલ ટેમ્પલેટ દ્વારા પેમેન્ટ રીમાઇન્ડર ----------------
    async def send_template_reminder(
        self,
        recipient_phone: str,
        customer_name: str,
        due_amount: str,
        upi_id: str,
        store_name: str,
        template_name: str = "volonce_payment_reminder",
        language_code: str = "gu",
    ) -> dict:
        """ઉધારી વસૂલાત માટેનું સત્તાવાર અપ્રૂવ્ડ WhatsApp રીમાઇન્ડર (૨૪ કલાક પછી પણ માન્ય)."""
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
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": str(customer_name or "Customer")},
                            {"type": "text", "text": str(due_amount)},
                            {"type": "text", "text": str(upi_id or "store@upi")},
                            {"type": "text", "text": str(store_name or "STORE")},
                        ],
                    }
                ],
            },
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                res = await client.post(url, headers=headers, json=payload)
                data = res.json()
                if res.status_code in (200, 201):
                    return {"success": True, "data": data}
                logger.error("WhatsApp Reminder Template Error: %s", res.text)
                return {"success": False, "error": data.get("error", {}).get("message", res.text)}
            except Exception as e:
                logger.error("WhatsApp Reminder Template Exception: %s", e)
                return {"success": False, "error": str(e)}

    # ---------------- ૪. સાદો ટેક્સ્ટ મેસેજ ----------------
    async def send_text_message(
        self,
        recipient_phone: str,
        text_message: str,
    ) -> dict:
        """ગ્રાહકને WhatsApp પર સાદો ટેક્સ્ટ મેસેજ મોકલે છે."""
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