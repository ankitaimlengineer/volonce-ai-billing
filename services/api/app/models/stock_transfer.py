import uuid
from datetime import date
from decimal import Decimal
from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.base import Base, TimestampMixin, UUIDMixin


class StockTransfer(UUIDMixin, TimestampMixin, Base):
    """એક ગોડાઉન/શાખામાંથી બીજી શાખામાં માલ ટ્રાન્સફર કરવાનું માસ્ટર ટેબલ."""
    __tablename__ = "stock_transfers"
    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_transfer_idempotency"),
        UniqueConstraint("organization_id", "transfer_number", name="uq_transfer_number"),
        CheckConstraint("from_shop_id <> to_shop_id", name="ck_transfer_different_shops"),
        CheckConstraint("status IN ('completed', 'cancelled')", name="ck_transfer_status"),
        Index("ix_transfers_org_date", "organization_id", "transfer_date"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    from_shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False, index=True
    )
    to_shop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    transfer_number: Mapped[str] = mapped_column(String(50), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="completed", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list["StockTransferItem"]] = relationship(
        "StockTransferItem", back_populates="transfer", cascade="all, delete-orphan"
    )


class StockTransferItem(UUIDMixin, Base):
    """ટ્રાન્સફર કરેલી આઇટમ્સની વિગત."""
    __tablename__ = "stock_transfer_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_transfer_item_qty_positive"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    transfer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stock_transfers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )

    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    batch_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    transfer: Mapped["StockTransfer"] = relationship("StockTransfer", back_populates="items")