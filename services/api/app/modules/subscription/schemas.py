import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------- સબસ્ક્રિપ્શન પ્લાન આઉટપુટ ----------------

class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    price: Decimal
    duration_days: int
    description: str | None = None
    is_active: bool


class SubscriptionStatusOut(BaseModel):
    is_active: bool
    is_trial: bool
    plan_name: str
    plan_slug: str
    starts_at: datetime
    expires_at: datetime
    days_left: int
    status: str


# ---------------- RAZORPAY પેમેન્ટ મોડેલ્સ ----------------

# Razorpay ઓર્ડર રિસ્પોન્સ મોડેલ (પેમેન્ટ શરૂ કરવા માટે)
class RazorpayOrderOut(BaseModel):
    order_id: str
    amount: int  # રકમ પૈસામાં (દા.ત. ₹299 = 29900 પૈસા)
    currency: str = "INR"
    key_id: str
    plan_slug: str
    plan_name: str


# Razorpay પેમેન્ટ વેરિફિકેશન વિનંતી મોડેલ
class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_slug: str


# વેરિફિકેશન સફળ થયા પછીનો રિસ્પોન્સ
class PaymentVerifyResponse(BaseModel):
    success: bool
    message: str


# ---------------- VOLONIS.IN વેબસાઇટ ઈન્ટિગ્રેશન મોડેલ્સ ----------------

# volonis.in પરથી ખરીદી થાય ત્યારે આવતો ડેટા
class ExternalPurchaseRequest(BaseModel):
    email: EmailStr = Field(description="ગ્રાહકનો રજીસ્ટર્ડ ઈમેલ")
    plan_slug: str = Field(description="પ્લાનનો slug: monthly, quarterly, half_yearly, yearly")
    order_id: str = Field(description="volonis.in વેબસાઇટનો ઓર્ડર નંબર")
    amount_paid: Decimal = Field(gt=0, description="ચૂકવેલી રકમ")


# volonis.in વેબસાઇટને મળતો સફળતાનો રિસ્પોન્સ
class ExternalPurchaseResponse(BaseModel):
    success: bool
    message: str
    expires_at: datetime


# ---------------- લાઈસન્સ / કૂપન કોડ રિડીમ મોડેલ ----------------

class RedeemCodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=50, description="પ્રોમો કોડ અથવા લાઈસન્સ કી")


class RedeemCodeResponse(BaseModel):
    success: bool
    message: str
    plan_name: str | None = None
    expires_at: datetime | None = None