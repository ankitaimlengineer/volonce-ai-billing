import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CustomerType = Literal["farmer", "retail", "business", "dealer", "distributor", "other"]


class CustomerBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = None
    customer_type: CustomerType = "retail"
    opening_balance: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    credit_limit: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    notes: str | None = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(CustomerBase):
    is_active: bool = True


class CustomerOut(CustomerBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool


class CustomerRow(CustomerOut):
    outstanding: Decimal = Decimal("0")


class CustomerList(BaseModel):
    items: list[CustomerRow]
    total: int
    page: int
    page_size: int


class CustomerPaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: str = Field(pattern="^(cash|upi|card|bank_transfer)$")
    note: str | None = Field(default=None, max_length=500)


class CustomerPaymentOut(BaseModel):
    id: uuid.UUID
    amount: Decimal
    outstanding: Decimal


class CustomerLedgerRow(BaseModel):
    id: uuid.UUID
    created_at: datetime
    entry_type: str
    debit: Decimal
    credit: Decimal
    balance: Decimal
    note: str | None


class CustomerLedgerOut(BaseModel):
    customer_id: uuid.UUID
    opening_balance: Decimal
    outstanding: Decimal
    items: list[CustomerLedgerRow]