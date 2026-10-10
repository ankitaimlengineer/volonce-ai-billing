import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
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


class SupplierLedger(UUIDMixin, Base):
    """Append-only. Balance owed to supplier = SUM(credit) - SUM(debit) (+ opening balance).

    credit = we owe more (purchase, adjustment +)
    debit  = we owe less (payment, purchase return)
    """

    __tablename__ = "supplier_ledger"
    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0", name="ck_sl_non_negative"),
        CheckConstraint(
            "(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)", name="ck_sl_one_side"
        ),
        CheckConstraint(
            "entry_type IN ('purchase','payment','purchase_return','adjustment')",
            name="ck_sl_type",
        ),
        Index("ix_sl_org_supplier", "organization_id", "supplier_id", "created_at"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )

    entry_type: Mapped[str] = mapped_column(String(20), nullable=False)
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)

    reference_type: Mapped[str | None] = mapped_column(String(30))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    payment_method: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )