import uuid
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


class StockTransferItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    batch_no: str | None = Field(default=None, max_length=50)
    expiry_date: date | None = None


class StockTransferCreate(BaseModel):
    from_shop_id: uuid.UUID
    to_shop_id: uuid.UUID
    transfer_date: date
    notes: str | None = Field(default=None, max_length=500)
    items: list[StockTransferItemIn] = Field(min_length=1, max_length=100)


class StockTransferItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str | None = None
    quantity: Decimal
    batch_no: str | None = None
    expiry_date: date | None = None


class StockTransferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transfer_number: str
    from_shop_id: uuid.UUID
    from_shop_name: str | None = None
    to_shop_id: uuid.UUID
    to_shop_name: str | None = None
    transfer_date: date
    status: str
    notes: str | None = None
    created_at: datetime
    items: list[StockTransferItemOut] = []