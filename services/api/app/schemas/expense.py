import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal[
    "rent", "salary", "electricity", "transport", "internet", "marketing", "maintenance", "other"
]
Method = Literal["cash", "upi", "card", "bank_transfer"]


class ExpenseCreate(BaseModel):
    category: Category
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    expense_date: date
    payment_method: Method
    notes: str | None = Field(default=None, max_length=500)


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    category: str
    amount: Decimal
    expense_date: date
    payment_method: str
    notes: str | None
    status: str
    created_at: datetime


class ExpenseList(BaseModel):
    items: list[ExpenseOut]
    total_amount: Decimal