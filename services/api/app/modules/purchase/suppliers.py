import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import Supplier, User
from app.schemas.supplier import SupplierCreate, SupplierList, SupplierOut, SupplierUpdate

router = APIRouter(prefix="/api/v1/suppliers", tags=["suppliers"])

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


def _clean(values: dict) -> dict:
    values["name"] = values["name"].strip()
    for key in ("mobile", "email", "address", "gst_number", "notes"):
        if isinstance(values.get(key), str):
            values[key] = values[key].strip() or None
    return values


def _get(db: Session, org_id: uuid.UUID, supplier_id: uuid.UUID) -> Supplier:
    # organization_id filter = tenant isolation
    s = db.scalar(
        select(Supplier).where(Supplier.id == supplier_id, Supplier.organization_id == org_id)
    )
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplier not found")
    return s


@router.get("", response_model=SupplierList)
def list_suppliers(
    q: str | None = Query(default=None, max_length=100),
    include_inactive: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    stmt = select(Supplier).where(Supplier.organization_id == org_id)
    if not include_inactive:
        stmt = stmt.where(Supplier.is_active.is_(True))
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Supplier.name.ilike(like),
                Supplier.mobile.ilike(like),
                Supplier.gst_number.ilike(like),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Supplier.name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return SupplierList(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
def create_supplier(
    data: SupplierCreate, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    supplier = Supplier(
        organization_id=_org_id(user), created_by=user.id, **_clean(data.model_dump())
    )
    db.add(supplier)
    db.commit()
    return supplier


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(
    supplier_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    return _get(db, _org_id(user), supplier_id)


@router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: uuid.UUID,
    data: SupplierUpdate,
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    supplier = _get(db, _org_id(user), supplier_id)
    for field, value in _clean(data.model_dump()).items():
        setattr(supplier, field, value)
    db.commit()
    return supplier


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(
    supplier_id: uuid.UUID, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    # Soft delete: old purchases and ledger must keep pointing to this supplier
    supplier = _get(db, _org_id(user), supplier_id)
    supplier.is_active = False
    db.commit()