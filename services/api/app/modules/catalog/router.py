import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import Category, Product, Shop, User
from app.schemas.catalog import (
    CategoryCreate,
    CategoryOut,
    ProductCreate,
    ProductList,
    ProductOut,
    ProductUpdate,
)

router = APIRouter(prefix="/api/v1", tags=["catalog"])

# Reading: any staff. Writing: owner / manager.
can_read = require_setup_completed
can_write = require_roles("owner", "manager")


def _org_id(user: User) -> uuid.UUID:
    if user.organization_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No business linked to this user")
    return user.organization_id


def _write_user(
    user: User = Depends(can_write), _setup: User = Depends(require_setup_completed)
) -> User:
    return user


def _check_category(db: Session, org_id: uuid.UUID, category_id: uuid.UUID | None) -> None:
    if category_id is None:
        return
    exists = db.scalar(
        select(Category.id).where(Category.id == category_id, Category.organization_id == org_id)
    )
    if exists is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid category")


def _clean(data: dict) -> dict:
    for key in ("sku", "barcode", "brand", "pack_size"):
        if isinstance(data.get(key), str):
            data[key] = data[key].strip() or None
    data["name"] = data["name"].strip()
    data["aliases"] = [a.strip() for a in data.get("aliases", []) if a.strip()]
    return data


def _get_product(db: Session, org_id: uuid.UUID, product_id: uuid.UUID) -> Product:
    # organization_id filter = tenant isolation
    p = db.scalar(select(Product).where(Product.id == product_id, Product.organization_id == org_id))
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return p


# ---------- Categories ----------

@router.get("/categories", response_model=list[CategoryOut])
def list_categories(user: User = Depends(can_read), db: Session = Depends(get_db)):
    return db.scalars(
        select(Category).where(Category.organization_id == _org_id(user)).order_by(Category.name)
    ).all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    data: CategoryCreate, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    cat = Category(organization_id=_org_id(user), name=data.name.strip())
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Category already exists")
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: uuid.UUID, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    org_id = _org_id(user)
    cat = db.scalar(
        select(Category).where(Category.id == category_id, Category.organization_id == org_id)
    )
    if cat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    in_use = db.scalar(
        select(func.count()).select_from(Product).where(Product.category_id == category_id)
    )
    if in_use:
        raise HTTPException(status.HTTP_409_CONFLICT, "Category has products")
    db.delete(cat)
    db.commit()


# ---------- Products ----------

@router.get("/products", response_model=ProductList)
def list_products(
    q: str | None = Query(default=None, max_length=100),
    category_id: uuid.UUID | None = None,
    include_inactive: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    stmt = select(Product).where(Product.organization_id == org_id)
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                Product.sku.ilike(like),
                Product.barcode.ilike(like),
                Product.brand.ilike(like),
                Product.search_keywords.ilike(like),
                cast(Product.aliases, String).ilike(like),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Product.name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return ProductList(items=items, total=total, page=page, page_size=page_size)


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductCreate, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    org_id = _org_id(user)
    values = _clean(data.model_dump())
    _check_category(db, org_id, values["category_id"])

    shop_id = db.scalar(
        select(Shop.id).where(Shop.organization_id == org_id, Shop.is_default.is_(True))
    )
    product = Product(organization_id=org_id, shop_id=shop_id, created_by=user.id, **values)
    db.add(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "SKU already exists")
    return product


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(
    product_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    return _get_product(db, _org_id(user), product_id)


@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    product = _get_product(db, org_id, product_id)
    values = _clean(data.model_dump())
    _check_category(db, org_id, values["category_id"])
    for field, value in values.items():
        setattr(product, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "SKU already exists")
    return product


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: uuid.UUID, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    # Soft delete: old invoices/stock history must keep pointing to this product
    product = _get_product(db, _org_id(user), product_id)
    product.is_active = False
    db.commit()