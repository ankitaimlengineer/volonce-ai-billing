import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, UUIDMixin


class Notification(UUIDMixin, Base):
    """દુકાનદાર માટેના લાઈવ એલર્ટ્સ (Low stock, payment due, expiry, subscription)."""
    __tablename__ = "notifications"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(30), default="info", nullable=False)  # 'stock', 'expiry', 'payment', 'subscription', 'system'
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)  # 'info', 'warning', 'critical'
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    link: Mapped[str | None] = mapped_column(String(200), nullable=True)  # URL redirect link
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )