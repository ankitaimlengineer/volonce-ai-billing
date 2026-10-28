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

# સ્ટોક મુવમેન્ટના તમામ માન્ય પ્રકારો (હવે ટ્રાન્સફર સપોર્ટ સાથે)
MOVEMENT_TYPES = (
    "opening",
    "purchase",
    "sales_return",
    "sale",
    "purchase_return",
    "damage",
    "expired",
    "adjustment",
    "transfer_in",
    "transfer_out",
)


class InventoryMovement(UUIDMixin, Base):
    """Append-only stock ledger. Rows are never updated or deleted."""

    __tablename__ = "inventory_movements"
    __table_args__ = (
        # જથ્થો ક્યારેય શૂન્ય (0) ન હોવો જોઈએ
        CheckConstraint("quantity <> 0", name="ck_movement_qty_not_zero"),
        
        # માન્ય મુવમેન્ટ પ્રકારોનું વેલિડેશન
        CheckConstraint(
            "movement_type IN ('opening','purchase','sales_return','sale',"
            "'purchase_return','damage','expired','adjustment','transfer_in','transfer_out')",
            name="ck_movement_type",
        ),
        
        # સ્ટોક અંદર આવવાની (+) અને બહાર જવાની (-) દિશાનું વેલિડેશન
        CheckConstraint(
            "(movement_type IN ('opening','purchase','sales_return','transfer_in') AND quantity > 0) OR "
            "(movement_type IN ('sale','purchase_return','damage','expired','transfer_out') AND quantity < 0) OR "
            "(movement_type = 'adjustment')",
            name="ck_movement_direction",
        ),
        
        # પર્ફોર્મન્સ ઇન્ડેક્સિસ
        Index("ix_movements_org_product", "organization_id", "product_id"),
        Index("ix_movements_org_shop_product", "organization_id", "shop_id", "product_id"),
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
    # Signed: + stock in (જમા), - stock out (ઉધાર/બાદ)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)

    # Optional batch / expiry (used by expiry tracking in step 4.5)
    batch_no: Mapped[str | None] = mapped_column(String(50))
    expiry_date: Mapped[date | None] = mapped_column(Date)

    # Which bill / purchase / transfer created this movement
    reference_type: Mapped[str | None] = mapped_column(String(30))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    note: Mapped[str | None] = mapped_column(Text)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )