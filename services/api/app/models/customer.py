import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, TimestampMixin, UUIDMixin


class Customer(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        CheckConstraint(
            "customer_type IN ('farmer','retail','business','dealer','distributor','other')",
            name="ck_customer_type",
        ),
        Index("ix_customers_org_name", "organization_id", "name"),
        Index("ix_customers_org_mobile", "organization_id", "mobile"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    mobile: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    customer_type: Mapped[str] = mapped_column(String(20), default="retail", nullable=False)
    # Positive = customer owes us (receivable)
    opening_balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), nullable=False
    )
    credit_limit: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CustomerLedger(UUIDMixin, Base):
    """Append-only. Receivable = opening + SUM(debit) - SUM(credit).

    debit  = customer owes more (sale)
    credit = customer owes less (payment, sales return)
    """

    __tablename__ = "customer_ledger"
    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0", name="ck_cl_non_negative"),
        CheckConstraint(
            "(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)", name="ck_cl_one_side"
        ),
        CheckConstraint(
            "entry_type IN ('sale','payment','sales_return','adjustment')", name="ck_cl_type"
        ),
        UniqueConstraint("organization_id", "idempotency_key", name="uq_cl_idempotency"),
        Index("ix_cl_org_customer", "organization_id", "customer_id", "created_at"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False
    )

    entry_type: Mapped[str] = mapped_column(String(20), nullable=False)
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=False)

    reference_type: Mapped[str | None] = mapped_column(String(30))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    payment_method: Mapped[str | None] = mapped_column(String(20))
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(Text)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )