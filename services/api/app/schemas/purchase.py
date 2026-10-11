import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PurchaseItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    rate: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2)
    batch_no: str | None = Field(default=None, max_length=50)
    expiry_date: date | None = None


class PurchaseCreate(BaseModel):
    supplier_id: uuid.UUID
    invoice_number: str = Field(min_length=1, max_length=50)
    purchase_date: date
    items: list[PurchaseItemIn] = Field(min_length=1, max_length=200)
    paid_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    payment_method: str | None = Field(default=None, pattern="^(cash|upi|card|bank_transfer)$")
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_payment(self):
        if self.paid_amount > 0 and not self.payment_method:
            raise ValueError("Paisa aapya hoy to payment method lakho")
        return self


class PurchaseItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_id: uuid.UUID
    quantity: Decimal
    rate: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
    line_total: Decimal
    batch_no: str | None
    expiry_date: date | None


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    supplier_id: uuid.UUID
    invoice_number: str
    purchase_date: date
    subtotal: Decimal
    tax_total: Decimal
    grand_total: Decimal
    paid_amount: Decimal
    payment_method: str | None
    status: str
    created_at: datetime
    items: list[PurchaseItemOut] = []