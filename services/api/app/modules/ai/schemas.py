import uuid
from decimal import Decimal
from pydantic import BaseModel, Field


class ScannedItem(BaseModel):
    raw_name: str
    matched_product_id: uuid.UUID | None = None
    matched_product_name: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=100.0)
    quantity: Decimal = Decimal("1.0")
    rate: Decimal = Decimal("0.0")
    tax_percent: Decimal = Decimal("0.0")
    total: Decimal = Decimal("0.0")


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