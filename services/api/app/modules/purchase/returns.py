import uuid
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import (
    InventoryMovement,
    Product,
    PurchaseInvoice,
    PurchaseItem,
    PurchaseReturn,
    PurchaseReturnItem,
    Shop,
    SupplierLedger,
    User,
)
from app.schemas.purchase_return import ReturnCreate, ReturnItemOut, ReturnOut

router = APIRouter(prefix="/api/v1/purchases", tags=["purchase returns"])

can_read = require_setup_completed
can_write = require_roles("owner", "manager")
CENT = Decimal("0.01")


def _org_id(user: User) -> uuid.UUID:
    if user.organization_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No business linked to this user")
    return user.organization_id


def _write_user(
    user: User = Depends(can_write), _setup: User = Depends(require_setup_completed)
) -> User:
    return user


def _money(v: Decimal) -> Decimal:
    return v.quantize(CENT, rounding=ROUND_HALF_UP)


def _to_out(db: Session, r: PurchaseReturn) -> ReturnOut:
    items = db.scalars(
        select(PurchaseReturnItem).where(PurchaseReturnItem.return_id == r.id)
    ).all()
    out = ReturnOut.model_validate(r, from_attributes=True)
    out.items = [ReturnItemOut.model_validate(i, from_attributes=True) for i in items]
    return out


def _find_by_key(db: Session, org_id: uuid.UUID, key: str) -> PurchaseReturn | None:
    return db.scalar(
        select(PurchaseReturn).where(
            PurchaseReturn.organization_id == org_id,
            PurchaseReturn.idempotency_key == key,
        )
    )


@router.post(
    "/{purchase_id}/returns", response_model=ReturnOut, status_code=status.HTTP_201_CREATED
)
def create_return(
    purchase_id: uuid.UUID,
    data: ReturnCreate,
    idempotency_key: str = Header(min_length=8, max_length=100, alias="Idempotency-Key"),
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)

    existing = _find_by_key(db, org_id, idempotency_key)
    if existing:
        return _to_out(db, existing)

    purchase = db.scalar(
        select(PurchaseInvoice).where(
            PurchaseInvoice.id == purchase_id,
            PurchaseInvoice.organization_id == org_id,
            PurchaseInvoice.status == "confirmed",
        )
    )
    if purchase is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Purchase not found")

    # Merge duplicate lines of the same purchase item
    wanted: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))
    for it in data.items:
        wanted[it.purchase_item_id] += it.quantity

    # Lock the original purchase items (serializes concurrent returns)
    item_ids = sorted(wanted.keys(), key=str)
    originals = {
        i.id: i
        for i in db.scalars(
            select(PurchaseItem)
            .where(
                PurchaseItem.id.in_(item_ids),
                PurchaseItem.purchase_id == purchase.id,
                PurchaseItem.organization_id == org_id,
            )
            .order_by(PurchaseItem.id)
            .with_for_update()
        ).all()
    }
    if len(originals) != len(item_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid purchase item")

    # Already returned quantity per item
    returned = dict(
        db.execute(
            select(PurchaseReturnItem.purchase_item_id, func.sum(PurchaseReturnItem.quantity))
            .where(
                PurchaseReturnItem.organization_id == org_id,
                PurchaseReturnItem.purchase_item_id.in_(item_ids),
            )
            .group_by(PurchaseReturnItem.purchase_item_id)
        ).all()
    )
    for item_id, qty in wanted.items():
        orig = originals[item_id]
        left = orig.quantity - Decimal(returned.get(item_id, 0))
        if qty > left:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Return qty vadhu che. Return thai shake: {left}",
            )

    # Lock products (fixed order) and check stock for each
    product_ids = sorted({originals[i].product_id for i in item_ids}, key=str)
    locked = db.scalars(
        select(Product)
        .where(Product.id.in_(product_ids), Product.organization_id == org_id)
        .order_by(Product.id)
        .with_for_update()
    ).all()
    if len(locked) != len(product_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid product")

    out_per_product: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))
    for item_id, qty in wanted.items():
        out_per_product[originals[item_id].product_id] += qty
    for pid, qty in out_per_product.items():
        balance = Decimal(
            db.scalar(
                select(func.coalesce(func.sum(InventoryMovement.quantity), 0)).where(
                    InventoryMovement.organization_id == org_id,
                    InventoryMovement.product_id == pid,
                )
            )
        )
        if balance - qty < 0:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Stock negative thai jashe. Current stock: {balance}",
            )

    # Totals calculated here, using ORIGINAL rate and tax
    lines = []
    subtotal = tax_total = Decimal("0")
    for item_id, qty in wanted.items():
        orig = originals[item_id]
        base = _money(qty * orig.rate)
        tax = _money(base * orig.tax_percent / Decimal("100"))
        subtotal += base
        tax_total += tax
        lines.append((orig, qty, tax, base + tax))
    grand_total = subtotal + tax_total

    shop_id = db.scalar(
        select(Shop.id).where(Shop.organization_id == org_id, Shop.is_default.is_(True))
    )

    # ---- ONE transaction ----
    try:
        ret = PurchaseReturn(
            organization_id=org_id,
            shop_id=shop_id,
            supplier_id=purchase.supplier_id,
            purchase_id=purchase.id,
            created_by=user.id,
            idempotency_key=idempotency_key,
            return_date=data.return_date,
            subtotal=subtotal,
            tax_total=tax_total,
            grand_total=grand_total,
            reason=(data.reason or "").strip() or None,
        )
        db.add(ret)
        db.flush()

        for orig, qty, tax, line_total in lines:
            db.add(
                PurchaseReturnItem(
                    organization_id=org_id,
                    return_id=ret.id,
                    purchase_item_id=orig.id,
                    product_id=orig.product_id,
                    quantity=qty,
                    rate=orig.rate,
                    tax_percent=orig.tax_percent,
                    tax_amount=tax,
                    line_total=line_total,
                    batch_no=orig.batch_no,
                    expiry_date=orig.expiry_date,
                )
            )
            db.add(
                InventoryMovement(
                    organization_id=org_id,
                    shop_id=shop_id,
                    product_id=orig.product_id,
                    movement_type="purchase_return",
                    quantity=-qty,
                    batch_no=orig.batch_no,
                    expiry_date=orig.expiry_date,
                    reference_type="purchase_return",
                    reference_id=ret.id,
                    created_by=user.id,
                )
            )

        if grand_total > 0:
            db.add(
                SupplierLedger(
                    organization_id=org_id,
                    supplier_id=purchase.supplier_id,
                    entry_type="purchase_return",
                    debit=grand_total,
                    reference_type="purchase_return",
                    reference_id=ret.id,
                    note=f"Return of invoice {purchase.invoice_number}",
                    created_by=user.id,
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        winner = _find_by_key(db, org_id, idempotency_key)
        if winner:
            return _to_out(db, winner)
        raise HTTPException(status.HTTP_409_CONFLICT, "Return save thayu nathi")

    return _to_out(db, ret)


@router.get("/{purchase_id}/returns", response_model=list[ReturnOut])
def list_returns(
    purchase_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    org_id = _org_id(user)
    rows = db.scalars(
        select(PurchaseReturn)
        .where(PurchaseReturn.organization_id == org_id, PurchaseReturn.purchase_id == purchase_id)
        .order_by(PurchaseReturn.created_at.desc())
    ).all()
    return [_to_out(db, r) for r in rows]