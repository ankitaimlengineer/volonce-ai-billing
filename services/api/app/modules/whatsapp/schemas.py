import uuid
from pydantic import BaseModel, Field


class WhatsAppSendRequest(BaseModel):
    phone_number: str = Field(min_length=10, max_length=15, description="Customer phone number with country code")
    custom_message: str | None = None


class WhatsAppSendResponse(BaseModel):
    success: bool
    message: str
    message_id: str | None = None
    direct_link: str | None = None