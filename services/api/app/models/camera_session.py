import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin, UUIDMixin


class CameraSession(UUIDMixin, TimestampMixin, Base):
    """A camera billing session that can hold 1 or multiple photos."""
    __tablename__ = "camera_sessions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True
    )

    mode: Mapped[str] = mapped_column(String(20), default="single", nullable=False)  # 'single' or 'multiple'
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # 'active', 'processed', 'converted', 'discarded'

    images: Mapped[list["CameraImage"]] = relationship("CameraImage", back_populates="session", cascade="all, delete-orphan")
    drafts: Mapped[list["BillDraft"]] = relationship("BillDraft", back_populates="session", cascade="all, delete-orphan")


class CameraImage(UUIDMixin, TimestampMixin, Base):
    """Individual photo captured in a session."""
    __tablename__ = "camera_images"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("camera_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    storage_key: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), default="image/jpeg", nullable=False)
    image_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # 'pending', 'analyzed', 'failed'

    session: Mapped["CameraSession"] = relationship("CameraSession", back_populates="images")
    detections: Mapped[list["AiDetection"]] = relationship("AiDetection", back_populates="image", cascade="all, delete-orphan")


class AiDetection(UUIDMixin, Base):
    """Raw products recognized by Vision AI from an image."""
    __tablename__ = "ai_detections"

    image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("camera_images.id", ondelete="CASCADE"), nullable=False, index=True
    )
    raw_name: Mapped[str] = mapped_column(String(255), nullable=False)
    matched_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True
    )
    detected_quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1.0"), nullable=False)
    confidence: Mapped[float] = mapped_column(default=0.0, nullable=False)
    uncertainty_level: Mapped[str] = mapped_column(String(20), default="low")  # 'low', 'medium', 'high'
    bounding_box: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    image: Mapped["CameraImage"] = relationship("CameraImage", back_populates="detections")


class BillDraft(UUIDMixin, TimestampMixin, Base):
    """Aggregated, editable draft bill created from session images."""
    __tablename__ = "bill_drafts"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("camera_sessions.id", ondelete="SET NULL"), nullable=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)  # 'draft', 'confirmed', 'discarded'
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.0"), nullable=False)
    tax_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.0"), nullable=False)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.0"), nullable=False)

    session: Mapped["CameraSession | None"] = relationship("CameraSession", back_populates="drafts")
    items: Mapped[list["BillDraftItem"]] = relationship("BillDraftItem", back_populates="draft", cascade="all, delete-orphan")


class BillDraftItem(UUIDMixin, Base):
    """Line items inside a draft bill."""
    __tablename__ = "bill_draft_items"

    draft_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bill_drafts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=Decimal("1.0"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.0"), nullable=False)
    tax_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.0"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.0"), nullable=False)
    confidence: Mapped[float] = mapped_column(default=100.0, nullable=False)
    bounding_box: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    draft: Mapped["BillDraft"] = relationship("BillDraft", back_populates="items")