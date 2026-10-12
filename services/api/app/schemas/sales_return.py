import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SReturnItemIn(BaseModel):
    invoice_item_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)


class SReturnCreate(BaseModel):
    items: list[SReturnItemIn] = Field(min_length=1, max_length=200)
    reason: str | None = Field(default=None, max_length=500)


class SReturnItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    invoice_item_id: uuid.UUID
    product_id: uuid.UUID
    quantity: Decimal
    line_total: Decimal


class SReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    invoice_id: uuid.UUID
    customer_id: uuid.UUID | None
    return_date: date
    grand_total: Decimal
    reason: str | None
    created_at: datetime
    items: list[SReturnItemOut] = []