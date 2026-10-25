import uuid
from pydantic import BaseModel, Field

class SendInvoiceWhatsAppRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=20)
    custom_note: str | None = None

class WhatsAppSendResponse(BaseModel):
    success: bool
    status: str
    message: str
    message_id: str | None = None
    fallback_url: str | None = None