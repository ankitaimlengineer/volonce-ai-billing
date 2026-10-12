import uuid
from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import (
    CustomerLedger,
    InventoryMovement,
    Invoice,
    InvoiceItem,
    Product,
    SalesReturn,
    SalesReturnItem,
    Shop,
    User,
)
from app.schemas.sales_return import SReturnCreate, SReturnItemOut, SReturnOut

router = APIRouter(prefix="/api/v1/invoices", tags=["sales returns"])

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


def _to_out(db: Session, r: SalesReturn) -> SReturnOut:
    items = db.scalars(select(SalesReturnItem).where(SalesReturnItem.return_id == r.id)).all()
    out = SReturnOut.model_validate(r, from_attributes=True)
    out.items = [SReturnItemOut.model_validate(i, from_attributes=True) for i in items]
    return out


def _find_by_key(db: Session, org_id: uuid.UUID, key: str) -> SalesReturn | None:
    return db.scalar(
        select(SalesReturn).where(
            SalesReturn.organization_id == org_id, SalesReturn.idempotency_key == key
        )
    )


@router.post(
    "/{invoice_id}/returns", response_model=SReturnOut, status_code=status.HTTP_201_CREATED
)
def create_return(
    invoice_id: uuid.UUID,
    data: SReturnCreate,
    idempotency_key: str = Header(min_length=8, max_length=100, alias="Idempotency-Key"),
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)

    existing = _find_by_key(db, org_id, idempotency_key)
    if existing:
        return _to_out(db, existing)

    inv = db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.organization_id == org_id,
            Invoice.status == "confirmed",
        )
    )
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    wanted: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))
    for it in data.items:
        wanted[it.invoice_item_id] += it.quantity

    # Lock original items (serializes concurrent returns of the same invoice)
    item_ids = sorted(wanted.keys(), key=str)
    originals = {
        i.id: i
        for i in db.scalars(
            select(InvoiceItem)
            .where(
                InvoiceItem.id.in_(item_ids),
                InvoiceItem.invoice_id == inv.id,
                InvoiceItem.organization_id == org_id,
            )
            .order_by(InvoiceItem.id)
            .with_for_update()
        ).all()
    }
    if len(originals) != len(item_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid invoice item")

    returned = dict(
        db.execute(
            select(SalesReturnItem.invoice_item_id, func.sum(SalesReturnItem.quantity))
            .where(
                SalesReturnItem.organization_id == org_id,
                SalesReturnItem.invoice_item_id.in_(item_ids),
            )
            .group_by(SalesReturnItem.invoice_item_id)
        ).all()
    )

    lines = []
    grand_total = Decimal("0")
    for item_id, qty in wanted.items():
        orig = originals[item_id]
        left = orig.quantity - Decimal(returned.get(item_id, 0))
        if qty > left:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"{orig.product_name}: return qty vadhu che. Return thai shake: {left}",
            )
        # Refund = original line total, in proportion to the returned quantity
        refund = (orig.line_total * qty / orig.quantity).quantize(CENT, rounding=ROUND_HALF_UP)
        grand_total += refund
        lines.append((orig, qty, refund))

    # Lock products (fixed order) so stock changes stay serialized
    product_ids = sorted({o.product_id for o, _q, _r in lines}, key=str)
    db.scalars(
        select(Product)
        .where(Product.id.in_(product_ids), Product.organization_id == org_id)
        .order_by(Product.id)
        .with_for_update()
    ).all()

    shop_id = db.scalar(
        select(Shop.id).where(Shop.organization_id == org_id, Shop.is_default.is_(True))
    )

    # ---- ONE transaction ----
    try:
        ret = SalesReturn(
            organization_id=org_id,
            shop_id=shop_id,
            invoice_id=inv.id,
            customer_id=inv.customer_id,
            created_by=user.id,
            idempotency_key=idempotency_key,
            return_date=date.today(),
            grand_total=grand_total,
            reason=(data.reason or "").strip() or None,
        )
        db.add(ret)
        db.flush()

        for orig, qty, refund in lines:
            db.add(
                SalesReturnItem(
                    organization_id=org_id,
                    return_id=ret.id,
                    invoice_item_id=orig.id,
                    product_id=orig.product_id,
                    quantity=qty,
                    line_total=refund,
                )
            )
            db.add(
                InventoryMovement(
                    organization_id=org_id,
                    shop_id=shop_id,
                    product_id=orig.product_id,
                    movement_type="sales_return",
                    quantity=qty,  # positive: stock comes back
                    reference_type="sales_return",
                    reference_id=ret.id,
                    created_by=user.id,
                )
            )

        if inv.customer_id is not None and grand_total > 0:
            db.add(
                CustomerLedger(
                    organization_id=org_id,
                    customer_id=inv.customer_id,
                    entry_type="sales_return",
                    credit=grand_total,
                    reference_type="sales_return",
                    reference_id=ret.id,
                    note=f"Return of invoice {inv.invoice_number}",
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


@router.get("/{invoice_id}/returns", response_model=list[SReturnOut])
def list_returns(
    invoice_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    org_id = _org_id(user)
    rows = db.scalars(
        select(SalesReturn)
        .where(SalesReturn.organization_id == org_id, SalesReturn.invoice_id == invoice_id)
        .order_by(SalesReturn.created_at.desc())
    ).all()
    return [_to_out(db, r) for r in rows]