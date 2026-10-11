import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ReturnItemIn(BaseModel):
    purchase_item_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)


class ReturnCreate(BaseModel):
    return_date: date
    items: list[ReturnItemIn] = Field(min_length=1, max_length=200)
    reason: str | None = Field(default=None, max_length=500)


class ReturnItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    purchase_item_id: uuid.UUID
    product_id: uuid.UUID
    quantity: Decimal
    rate: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
    line_total: Decimal
    batch_no: str | None
    expiry_date: date | None


class ReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    purchase_id: uuid.UUID
    supplier_id: uuid.UUID
    return_date: date
    subtotal: Decimal
    tax_total: Decimal
    grand_total: Decimal
    reason: str | None
    created_at: datetime
    items: list[ReturnItemOut] = []