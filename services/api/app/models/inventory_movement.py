import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, UUIDMixin

MOVEMENT_TYPES = (
    "opening",
    "purchase",
    "sales_return",
    "sale",
    "purchase_return",
    "damage",
    "expired",
    "adjustment",
)


class InventoryMovement(UUIDMixin, Base):
    """Append-only stock ledger. Rows are never updated or deleted."""

    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint("quantity <> 0", name="ck_movement_qty_not_zero"),
        CheckConstraint(
            "movement_type IN ('opening','purchase','sales_return','sale',"
            "'purchase_return','damage','expired','adjustment')",
            name="ck_movement_type",
        ),
        # Direction must match the type (adjustment can be + or -)
        CheckConstraint(
            "(movement_type IN ('opening','purchase','sales_return') AND quantity > 0) OR "
            "(movement_type IN ('sale','purchase_return','damage','expired') AND quantity < 0) OR "
            "(movement_type = 'adjustment')",
            name="ck_movement_direction",
        ),
        Index("ix_movements_org_product", "organization_id", "product_id"),
        Index("ix_movements_reference", "reference_type", "reference_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )

    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Signed: + stock in, - stock out
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)

    # Optional batch / expiry (used by expiry tracking in step 4.5)
    batch_no: Mapped[str | None] = mapped_column(String(50))
    expiry_date: Mapped[date | None] = mapped_column(Date)

    # Which bill / purchase created this movement (filled from Phase 5/6)
    reference_type: Mapped[str | None] = mapped_column(String(30))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    note: Mapped[str | None] = mapped_column(Text)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )