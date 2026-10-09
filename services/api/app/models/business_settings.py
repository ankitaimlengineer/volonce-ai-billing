import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, TimestampMixin, UUIDMixin


class BusinessSettings(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "business_settings"

    # One settings row per organization
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        nullable=False,
        unique=True,
    )

    # Bank details
    bank_name: Mapped[str | None] = mapped_column(String(200))
    bank_account_holder: Mapped[str | None] = mapped_column(String(200))
    bank_account_number: Mapped[str | None] = mapped_column(String(50))
    bank_ifsc: Mapped[str | None] = mapped_column(String(20))

    # UPI
    upi_id: Mapped[str | None] = mapped_column(String(100))

    # Invoice text
    terms_and_conditions: Mapped[str | None] = mapped_column(Text)
    invoice_footer: Mapped[str | None] = mapped_column(Text)

    # Invoice template + numbering
    invoice_template: Mapped[str] = mapped_column(
        String(30), default="professional", nullable=False
    )
    invoice_prefix: Mapped[str] = mapped_column(String(20), default="INV", nullable=False)
    invoice_number_padding: Mapped[int] = mapped_column(Integer, default=5, nullable=False)

    # Logo / signature (private storage keys, never public URLs)
    logo_key: Mapped[str | None] = mapped_column(String(300))
    logo_content_type: Mapped[str | None] = mapped_column(String(50))
    signature_key: Mapped[str | None] = mapped_column(String(300))
    signature_content_type: Mapped[str | None] = mapped_column(String(50))