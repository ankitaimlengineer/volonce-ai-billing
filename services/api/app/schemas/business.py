from typing import Literal

from pydantic import BaseModel, Field

BusinessType = Literal["retail", "wholesale", "distributor", "manufacturer", "service", "other"]
BusinessCategory = Literal[
    "general_store", "clothing", "electronics", "mobile", "hardware", "bakery",
    "furniture", "spare_parts", "agro_shop", "pharmacy", "other",
]
InvoiceTemplate = Literal["professional", "minimal", "modern", "retail", "wholesale"]


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    owner_name: str | None = Field(default=None, max_length=200)
    business_type: BusinessType | None = None
    business_category: BusinessCategory | None = None
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = None
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, max_length=10)
    gst_number: str | None = Field(default=None, max_length=20)


class SettingsUpdate(BaseModel):
    bank_name: str | None = Field(default=None, max_length=200)
    bank_account_holder: str | None = Field(default=None, max_length=200)
    bank_account_number: str | None = Field(default=None, max_length=50)
    bank_ifsc: str | None = Field(default=None, max_length=20)
    upi_id: str | None = Field(default=None, max_length=100)
    terms_and_conditions: str | None = None
    invoice_footer: str | None = None
    invoice_template: InvoiceTemplate = "professional"
    invoice_prefix: str = Field(default="INV", min_length=1, max_length=20)
    invoice_number_padding: int = Field(default=5, ge=3, le=10)


class ProfileResponse(ProfileUpdate):
    setup_completed: bool


class SettingsResponse(SettingsUpdate):
    pass


class BusinessResponse(BaseModel):
    profile: ProfileResponse
    settings: SettingsResponse