import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ૧. ઇન્વોઇસ બિલ WhatsApp પર મોકલવાની વિનંતી
class SendInvoiceWhatsAppRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=20, description="ગ્રાહકનો ૧૦ કે ૧૨ અંકનો મોબાઈલ નંબર")
    custom_note: str | None = Field(default=None, max_length=500, description="કોઈ ખાસ નોંધ")


# ૨. ગ્રાહકની ખાતાવહી સ્ટેટમેન્ટ PDF WhatsApp પર મોકલવાની વિનંતી
class SendLedgerWhatsAppRequest(BaseModel):
    phone: str | None = Field(default=None, max_length=20, description="બીજા નંબર પર મોકલવું હોય તો વૈકલ્પિક ફોન નંબર")
    custom_note: str | None = Field(default=None, max_length=500)


# ૩. ઉધારી ચૂકવણી રીમાઇન્ડર મેસેજ મોકલવાની વિનંતી
class SendReminderRequest(BaseModel):
    phone: str | None = Field(default=None, max_length=20)
    custom_message: str | None = Field(default=None, max_length=1000)


# ૪. WhatsApp મોકલ્યા પછીનો રિસ્પોન્સ (API અથવા Direct Chat Fallback URL)
class WhatsAppSendResponse(BaseModel):
    success: bool
    status: str  # 'sent', 'pending', 'fallback', 'failed'
    message: str
    message_id: str | None = None
    fallback_url: str | None = None


# ૫. WhatsApp મેસેજના લાઈવ ડિલિવરી સ્ટેટસ ટ્રેકિંગ મોડેલ (Sent / Delivered / Read)
class WhatsAppMessageStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID | None = None
    recipient_phone: str
    message_type: str = "invoice_pdf"  # 'invoice_pdf', 'ledger_statement', 'payment_reminder'
    whatsapp_message_id: str | None = None
    status: str  # 'pending', 'sent', 'delivered', 'read', 'failed', 'fallback'
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime