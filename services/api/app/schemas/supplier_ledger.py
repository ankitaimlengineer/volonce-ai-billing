import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: str = Field(pattern="^(cash|upi|card|bank_transfer)$")
    note: str | None = Field(default=None, max_length=500)


class LedgerRow(BaseModel):
    id: uuid.UUID
    created_at: datetime
    entry_type: str
    debit: Decimal
    credit: Decimal
    balance: Decimal
    note: str | None


class LedgerOut(BaseModel):
    supplier_id: uuid.UUID
    opening_balance: Decimal
    outstanding: Decimal
    items: list[LedgerRow]


class PaymentOut(BaseModel):
    id: uuid.UUID
    amount: Decimal
    outstanding: Decimal