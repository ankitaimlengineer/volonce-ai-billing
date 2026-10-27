from decimal import Decimal
from pydantic import BaseModel, Field


class DailyTrendPoint(BaseModel):
    """દિવસ-વાર વેચાણ, વસૂલાત, ખર્ચ અને નફાના ચાર્ટ ડેટા માટેનું મોડેલ"""
    date: str
    sales: Decimal = Decimal("0")
    collections: Decimal = Decimal("0")
    expenses: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")


class PaymentMethodPoint(BaseModel):
    """પેમેન્ટ પદ્ધતિઓ (Cash, UPI, Card) ના ડોનટ ચાર્ટ માટેનું મોડેલ"""
    method: str
    amount: Decimal = Decimal("0")


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
    # 📈 પગલું ૩ માટે ઉમેરેલા ચાર્ટ ડેટા ફીલ્ડ્સ:
    daily_trend: list[DailyTrendPoint] = Field(default_factory=list)
    payment_breakdown: list[PaymentMethodPoint] = Field(default_factory=list)