import os
import urllib.parse
import httpx
from dotenv import load_dotenv

load_dotenv()

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "").strip()
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "").strip()


def format_phone_number(phone: str) -> str:
    """Ensures phone has country code (defaults to India +91 if 10 digits)."""
    clean = "".join(filter(str.isdigit, phone))
    if len(clean) == 10:
        return f"91{clean}"
    return clean


def generate_whatsapp_intent_link(phone: str, message: str) -> str:
    """Generates direct WhatsApp Web / App link for zero-setup messaging."""
    formatted_phone = format_phone_number(phone)
    encoded_msg = urllib.parse.quote(message)
    return f"https://api.whatsapp.com/send?phone={formatted_phone}&text={encoded_msg}"


async def send_meta_cloud_message(phone: str, message: str) -> dict:
    """
    Sends message using Meta Official WhatsApp Cloud API
    Requires WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in environment.
    """
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        return {"sent": False, "reason": "Cloud API credentials not configured"}

    formatted_phone = format_phone_number(phone)
    url = f"https://graph.facebook.com/v19.0/{WHATSAPP_PHONE_ID}/messages"

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    payload = {
        "messaging_product": "whatsapp",
        "to": formatted_phone,
        "type": "text",
        "text": {"body": message},
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                msg_id = data.get("messages", [{}])[0].get("id")
                return {"sent": True, "message_id": msg_id}
            else:
                return {"sent": False, "reason": res.text}
        except Exception as e:
            return {"sent": False, "reason": str(e)}