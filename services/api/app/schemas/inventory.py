import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ManualType = Literal["opening", "adjustment", "damage", "expired"]


class MovementCreate(BaseModel):
    product_id: uuid.UUID
    movement_type: ManualType
    # opening/damage/expired: positive number. adjustment: + or -
    quantity: Decimal = Field(max_digits=14, decimal_places=3)
    batch_no: str | None = Field(default=None, max_length=50)
    expiry_date: date | None = None
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_quantity(self):
        if self.quantity == 0:
            raise ValueError("quantity zero na hoi shake")
        if self.movement_type != "adjustment" and self.quantity < 0:
            raise ValueError("Aa type mate quantity positive lakho")
        if self.movement_type == "adjustment" and not (self.note or "").strip():
            raise ValueError("Adjustment mate karan (note) lakhvu jaruri che")
        return self


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    product_id: uuid.UUID
    movement_type: str
    quantity: Decimal
    batch_no: str | None
    expiry_date: date | None
    note: str | None
    created_at: datetime


class StockOut(BaseModel):
    product_id: uuid.UUID
    current_stock: Decimal