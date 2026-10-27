import uuid
from datetime import datetime
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


class WhatsAppMessageStatusOut(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID | None
    recipient_phone: str
    whatsapp_message_id: str | None
    status: str  # pending, sent, delivered, read, failed, fallback
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime