import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, TimestampMixin, UUIDMixin


class SalesReturn(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sales_returns"
    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_sreturn_idempotency"),
        CheckConstraint("grand_total >= 0", name="ck_sreturn_amounts"),
        Index("ix_sreturn_org_date", "organization_id", "return_date"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id")
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id"), index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )

    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    return_date: Mapped[date] = mapped_column(Date, nullable=False)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)


class SalesReturnItem(UUIDMixin, Base):
    __tablename__ = "sales_return_items"
    __table_args__ = (
        CheckConstraint("quantity > 0 AND line_total >= 0", name="ck_sreturn_item_values"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    return_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_returns.id"), nullable=False, index=True
    )
    invoice_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoice_items.id"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False
    )

    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)