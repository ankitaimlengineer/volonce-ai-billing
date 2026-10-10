import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import InventoryMovement, Product, Shop, User
from app.schemas.inventory import MovementCreate, MovementOut, StockOut

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])

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


def current_stock(db: Session, org_id: uuid.UUID, product_id: uuid.UUID) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(InventoryMovement.quantity), 0)).where(
            InventoryMovement.organization_id == org_id,
            InventoryMovement.product_id == product_id,
        )
    )
    return Decimal(total)


def _find_product(db: Session, org_id: uuid.UUID, product_id: uuid.UUID, lock: bool = False):
    # organization_id filter = tenant isolation
    stmt = select(Product).where(Product.id == product_id, Product.organization_id == org_id)
    if lock:
        stmt = stmt.with_for_update()  # serialize stock changes of this product
    p = db.scalar(stmt)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return p


@router.post("/movements", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
def create_movement(
    data: MovementCreate, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    org_id = _org_id(user)
    product = _find_product(db, org_id, data.product_id, lock=True)
    if not product.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Product active nathi")

    qty = data.quantity
    if data.movement_type in ("damage", "expired"):
        qty = -qty

    balance = current_stock(db, org_id, product.id)

    if data.movement_type == "opening":
        has_opening = db.scalar(
            select(func.count()).select_from(InventoryMovement).where(
                InventoryMovement.organization_id == org_id,
                InventoryMovement.product_id == product.id,
                InventoryMovement.movement_type == "opening",
            )
        )
        if has_opening:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Opening stock pehla thi che. Badlav mate adjustment vapro.",
            )

    if balance + qty < 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Stock negative thai jashe. Current stock: {balance}",
        )

    shop_id = db.scalar(
        select(Shop.id).where(Shop.organization_id == org_id, Shop.is_default.is_(True))
    )
    movement = InventoryMovement(
        organization_id=org_id,
        shop_id=shop_id,
        product_id=product.id,
        movement_type=data.movement_type,
        quantity=qty,
        batch_no=(data.batch_no or "").strip() or None,
        expiry_date=data.expiry_date,
        note=(data.note or "").strip() or None,
        created_by=user.id,
    )
    db.add(movement)
    db.commit()
    return movement


@router.get("/products/{product_id}/stock", response_model=StockOut)
def get_stock(
    product_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    org_id = _org_id(user)
    _find_product(db, org_id, product_id)
    return StockOut(product_id=product_id, current_stock=current_stock(db, org_id, product_id))


@router.get("/products/{product_id}/movements", response_model=list[MovementOut])
def list_movements(
    product_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    _find_product(db, org_id, product_id)
    return db.scalars(
        select(InventoryMovement)
        .where(
            InventoryMovement.organization_id == org_id,
            InventoryMovement.product_id == product_id,
        )
        .order_by(InventoryMovement.created_at.desc())
        .limit(limit)
    ).all()