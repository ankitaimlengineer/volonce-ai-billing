import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=64)
    barcode: str | None = Field(default=None, max_length=64)
    brand: str | None = Field(default=None, max_length=100)
    category_id: uuid.UUID | None = None
    unit: str = Field(default="pcs", min_length=1, max_length=20)
    pack_size: str | None = Field(default=None, max_length=50)
    purchase_price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    selling_price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    mrp: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2)
    min_stock: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=3)
    search_keywords: str | None = None
    aliases: list[str] = Field(default_factory=list, max_length=20)
    attributes: dict = Field(default_factory=dict)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(ProductBase):
    is_active: bool = True


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool


class ProductList(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int