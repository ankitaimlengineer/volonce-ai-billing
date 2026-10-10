import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import InventoryMovement, Product, Shop, User
from app.schemas.inventory import (
    ExpiryReport,
    ExpiryRow,
    MovementCreate,
    MovementOut,
    StockOut,
    StockReport,
    StockRow,
    StockSummary,
)

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


@router.get("/expiry", response_model=ExpiryReport)
def expiry_report(
    days: int = Query(default=30, ge=1, le=365),
    status_filter: str | None = Query(
        default=None, alias="status", pattern="^(expired|soon|ok)$"
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    today = date.today()
    limit_date = today + timedelta(days=days)

    qty = func.sum(InventoryMovement.quantity)
    rows = db.execute(
        select(
            Product.id,
            Product.name,
            Product.sku,
            Product.unit,
            InventoryMovement.batch_no,
            InventoryMovement.expiry_date,
            qty.label("qty"),
        )
        .join(Product, Product.id == InventoryMovement.product_id)
        .where(
            InventoryMovement.organization_id == org_id,
            Product.organization_id == org_id,
            Product.is_active.is_(True),
            InventoryMovement.expiry_date.is_not(None),
        )
        .group_by(
            Product.id,
            Product.name,
            Product.sku,
            Product.unit,
            InventoryMovement.batch_no,
            InventoryMovement.expiry_date,
        )
        .having(qty > 0)
        .order_by(InventoryMovement.expiry_date, Product.name)
    ).all()

    items: list[ExpiryRow] = []
    expired = soon = 0
    for pid, name, sku, unit, batch, exp, q in rows:
        left = (exp - today).days
        st = "expired" if exp < today else ("soon" if exp <= limit_date else "ok")
        if st == "expired":
            expired += 1
        elif st == "soon":
            soon += 1
        if status_filter and st != status_filter:
            continue
        items.append(
            ExpiryRow(
                product_id=pid,
                name=name,
                sku=sku,
                unit=unit,
                batch_no=batch,
                expiry_date=exp,
                quantity=Decimal(q),
                days_left=left,
                status=st,
            )
        )

    total = len(items)
    start = (page - 1) * page_size
    return ExpiryReport(
        expired=expired,
        soon=soon,
        items=items[start : start + page_size],
        total=total,
        page=page,
        page_size=page_size,
    )


# NOTE: "/stock" is a fixed path, separate from "/products/{product_id}/stock"
@router.get("/stock", response_model=StockReport)
def stock_report(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(in|low|out)$"),
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)

    # One query: stock of every product = SUM of its ledger
    stock_sq = (
        select(
            InventoryMovement.product_id.label("pid"),
            func.sum(InventoryMovement.quantity).label("qty"),
        )
        .where(InventoryMovement.organization_id == org_id)
        .group_by(InventoryMovement.product_id)
        .subquery()
    )
    qty = func.coalesce(stock_sq.c.qty, 0)

    base = (
        select(Product, qty.label("stock"))
        .outerjoin(stock_sq, stock_sq.c.pid == Product.id)
        .where(Product.organization_id == org_id, Product.is_active.is_(True))
    )

    # Summary is over ALL active products (not affected by filter/search)
    all_rows = db.execute(base).all()
    low = out = 0
    value = Decimal("0")
    for p, stock in all_rows:
        stock = Decimal(stock)
        if stock <= 0:
            out += 1
        elif stock <= p.min_stock:
            low += 1
        if stock > 0:
            value += stock * p.purchase_price
    summary = StockSummary(
        total_products=len(all_rows),
        low_stock=low,
        out_of_stock=out,
        stock_value=value.quantize(Decimal("0.01")),
    )

    stmt = base
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    if status_filter == "out":
        stmt = stmt.where(qty <= 0)
    elif status_filter == "low":
        stmt = stmt.where(qty > 0, qty <= Product.min_stock)
    elif status_filter == "in":
        stmt = stmt.where(qty > Product.min_stock)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(
        stmt.order_by(Product.name).offset((page - 1) * page_size).limit(page_size)
    ).all()

    items = []
    for p, stock in rows:
        stock = Decimal(stock)
        st = "out" if stock <= 0 else ("low" if stock <= p.min_stock else "in")
        items.append(
            StockRow(
                product_id=p.id,
                name=p.name,
                sku=p.sku,
                unit=p.unit,
                min_stock=p.min_stock,
                purchase_price=p.purchase_price,
                current_stock=stock,
                stock_value=(max(stock, Decimal("0")) * p.purchase_price).quantize(
                    Decimal("0.01")
                ),
                status=st,
            )
        )
    return StockReport(summary=summary, items=items, total=total, page=page, page_size=page_size)


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