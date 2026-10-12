import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class InvoiceItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    discount_percent: Decimal = Field(
        default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2
    )


class PaymentIn(BaseModel):
    method: str = Field(pattern="^(cash|upi|card|bank_transfer)$")
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class InvoiceCreate(BaseModel):
    customer_id: uuid.UUID | None = None  # None = walk-in
    items: list[InvoiceItemIn] = Field(min_length=1, max_length=200)
    payments: list[PaymentIn] = Field(default_factory=list, max_length=4)
    notes: str | None = Field(default=None, max_length=500)


class InvoiceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_id: uuid.UUID
    product_name: str
    quantity: Decimal
    rate: Decimal
    discount_amount: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
    line_total: Decimal


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    method: str
    amount: Decimal


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_number: str
    invoice_date: date
    customer_id: uuid.UUID | None
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    grand_total: Decimal
    paid_amount: Decimal
    status: str
    created_at: datetime
    items: list[InvoiceItemOut] = []
    payments: list[PaymentOut] = []