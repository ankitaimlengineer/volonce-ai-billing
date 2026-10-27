import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# =========================================================================
# ૧. CATEGORY SCHEMAS
# =========================================================================

class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str


# =========================================================================
# ૨. PRODUCT VARIANT SCHEMAS
# =========================================================================

class ProductVariantBase(BaseModel):
    variant_name: str = Field(min_length=1, max_length=100, description="દા.ત. '500ml', '1L', 'XL / Black', '128GB'")
    sku: str | None = Field(default=None, max_length=64)
    barcode: str | None = Field(default=None, max_length=64)
    purchase_price: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    selling_price: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    mrp: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    attributes: dict = Field(default_factory=dict)
    is_active: bool = True


class ProductVariantCreate(ProductVariantBase):
    pass


class ProductVariantUpdate(ProductVariantBase):
    pass


class ProductVariantOut(ProductVariantBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    product_id: uuid.UUID


# =========================================================================
# ૩. MAIN PRODUCT SCHEMAS
# =========================================================================

class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=64)
    barcode: str | None = Field(default=None, max_length=64)
    brand: str | None = Field(default=None, max_length=100)
    category_id: uuid.UUID | None = None
    unit: str = Field(default="pcs", min_length=1, max_length=20)
    pack_size: str | None = Field(default=None, max_length=50)
    purchase_price: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    selling_price: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    mrp: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    tax_percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100, max_digits=5, decimal_places=2)
    min_stock: Decimal = Field(default=Decimal("0.000"), ge=0, max_digits=14, decimal_places=3)
    search_keywords: str | None = None
    aliases: list[str] = Field(default_factory=list, max_length=20)
    attributes: dict = Field(default_factory=dict)


class ProductCreate(ProductBase):
    variants: list[ProductVariantCreate] = Field(default_factory=list)


class ProductUpdate(ProductBase):
    is_active: bool = True
    variants: list[ProductVariantCreate] = Field(default_factory=list)


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool
    variants: list[ProductVariantOut] = Field(default_factory=list)


class ProductList(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int