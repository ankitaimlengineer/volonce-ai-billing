import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, TimestampMixin, UUIDMixin


class WhatsAppMessage(UUIDMixin, TimestampMixin, Base):
    """WhatsApp મેસેજના લાઈવ સ્ટેટસ ટ્રેકિંગ માટેનું ટેબલ."""
    __tablename__ = "whatsapp_messages"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=True, index=True
    )
    recipient_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    message_type: Mapped[str] = mapped_column(String(30), default="invoice_pdf", nullable=False)
    
    # Meta WhatsApp Message ID (e.g. wamid.HBg...)
    whatsapp_message_id: Mapped[str | None] = mapped_column(String(128), unique=True, index=True)
    
    # status: pending, sent, delivered, read, failed, fallback
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    
    error_message: Mapped[str | None] = mapped_column(Text)