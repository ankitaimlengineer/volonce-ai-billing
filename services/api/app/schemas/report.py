from decimal import Decimal

from pydantic import BaseModel


class Summary(BaseModel):
    date_from: str
    date_to: str
    sales: Decimal
    bills: int
    collections: Decimal
    purchases: Decimal
    cogs: Decimal
    gross_profit: Decimal
    margin_percent: Decimal
    expenses: Decimal
    net_profit: Decimal
    receivable: Decimal
    payable: Decimal
    stock_value: Decimal
    low_stock: int
    out_of_stock: int