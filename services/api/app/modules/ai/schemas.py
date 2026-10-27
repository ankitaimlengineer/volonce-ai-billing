import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# ---------------- ૧. સિંગલ સ્કેન અને ડીટેક્શન સ્કીમાઝ ----------------

class ScannedItem(BaseModel):
    raw_name: str
    matched_product_id: uuid.UUID | None = None
    matched_product_name: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=100.0)
    quantity: Decimal = Decimal("1.0")
    rate: Decimal = Decimal("0.0")
    tax_percent: Decimal = Decimal("0.0")
    total: Decimal = Decimal("0.0")
    uncertainty_level: str = "low"  # 'low', 'medium', 'high'


class DuplicateCheckResult(BaseModel):
    is_duplicate: bool = False
    reason: str | None = None
    existing_invoice_id: uuid.UUID | None = None
    existing_invoice_number: str | None = None


class BillScanResponse(BaseModel):
    invoice_number: str | None = None
    invoice_date: str | None = None
    vendor_or_customer: str | None = None
    items: list[ScannedItem] = Field(default_factory=list)
    subtotal: Decimal = Decimal("0.0")
    tax_total: Decimal = Decimal("0.0")
    grand_total: Decimal = Decimal("0.0")
    duplicate_info: DuplicateCheckResult = Field(default_factory=DuplicateCheckResult)
    overall_confidence: float = 0.0
    image_hash: str | None = None


# ---------------- ૨. PHASE 10: CAMERA SESSIONS SCHEMAS ----------------

class CameraSessionCreate(BaseModel):
    customer_id: uuid.UUID | None = None
    mode: Literal["single", "multiple"] = "single"


class CameraSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    shop_id: uuid.UUID | None = None
    user_id: uuid.UUID
    customer_id: uuid.UUID | None = None
    mode: str
    status: str
    created_at: datetime


# ---------------- ૩. PHASE 11: CONSOLIDATED DRAFT BILL SCHEMAS ----------------

class DraftItemIn(BaseModel):
    product_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    rate: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    tax_percent: Decimal = Field(default=Decimal("0.0"), ge=0, le=100, max_digits=5, decimal_places=2)


class DraftItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None = None
    name: str
    quantity: Decimal
    rate: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
    total: Decimal
    confidence: float


class DraftBillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    session_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    status: str
    subtotal: Decimal
    tax_total: Decimal
    grand_total: Decimal
    created_at: datetime
    items: list[DraftItemOut] = []


class DraftBillUpdate(BaseModel):
    customer_id: uuid.UUID | None = None
    items: list[DraftItemIn] = Field(min_length=1)