import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SupplierBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = None
    gst_number: str | None = Field(default=None, max_length=20)
    opening_balance: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    notes: str | None = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(SupplierBase):
    is_active: bool = True


class SupplierOut(SupplierBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool


class SupplierRow(SupplierOut):
    outstanding: Decimal = Decimal("0")


class SupplierList(BaseModel):
    items: list[SupplierRow]
    total: int
    page: int
    page_size: int