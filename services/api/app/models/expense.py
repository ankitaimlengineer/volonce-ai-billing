import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, TimestampMixin, UUIDMixin


class Expense(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "expenses"
    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_expense_idempotency"),
        CheckConstraint("amount > 0", name="ck_expense_amount"),
        CheckConstraint(
            "category IN ('rent','salary','electricity','transport','internet',"
            "'marketing','maintenance','other')",
            name="ck_expense_category",
        ),
        CheckConstraint(
            "payment_method IN ('cash','upi','card','bank_transfer')", name="ck_expense_method"
        ),
        CheckConstraint("status IN ('active','cancelled')", name="ck_expense_status"),
        Index("ix_expense_org_date", "organization_id", "expense_date"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)