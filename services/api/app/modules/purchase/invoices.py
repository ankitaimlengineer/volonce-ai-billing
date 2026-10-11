import uuid
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import (
    InventoryMovement,
    Product,
    PurchaseInvoice,
    PurchaseItem,
    Shop,
    Supplier,
    SupplierLedger,
    User,
)
from app.schemas.purchase import PurchaseCreate, PurchaseItemOut, PurchaseOut

router = APIRouter(prefix="/api/v1/purchases", tags=["purchases"])

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


def _to_out(db: Session, p: PurchaseInvoice) -> PurchaseOut:
    items = db.scalars(select(PurchaseItem).where(PurchaseItem.purchase_id == p.id)).all()
    out = PurchaseOut.model_validate(p, from_attributes=True)
    out.items = [PurchaseItemOut.model_validate(i, from_attributes=True) for i in items]
    return out


def _find_by_key(db: Session, org_id: uuid.UUID, key: str) -> PurchaseInvoice | None:
    return db.scalar(
        select(PurchaseInvoice).where(
            PurchaseInvoice.organization_id == org_id,
            PurchaseInvoice.idempotency_key == key,
        )
    )


@router.post("", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED)
def create_purchase(
    data: PurchaseCreate,
    idempotency_key: str = Header(min_length=8, max_length=100, alias="Idempotency-Key"),
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)

    # Same key again (double click / retry) -> return the existing purchase
    existing = _find_by_key(db, org_id, idempotency_key)
    if existing:
        return _to_out(db, existing)

    supplier = db.scalar(
        select(Supplier).where(
            Supplier.id == data.supplier_id,
            Supplier.organization_id == org_id,
            Supplier.is_active.is_(True),
        )
    )
    if supplier is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid supplier")

    # Lock products in a fixed order (prevents deadlocks, serializes stock changes)
    product_ids = sorted({i.product_id for i in data.items}, key=str)
    products = {
        p.id: p
        for p in db.scalars(
            select(Product)
            .where(
                Product.id.in_(product_ids),
                Product.organization_id == org_id,
                Product.is_active.is_(True),
            )
            .order_by(Product.id)
            .with_for_update()
        ).all()
    }
    if len(products) != len(product_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid product in items")

    # Totals are calculated HERE, never trusted from the client
    lines = []
    subtotal = tax_total = Decimal("0")
    for it in data.items:
        base = _money(it.quantity * it.rate)
        tax = _money(base * it.tax_percent / Decimal("100"))
        subtotal += base
        tax_total += tax
        lines.append((it, tax, base + tax))
    grand_total = subtotal + tax_total

    if data.paid_amount > grand_total:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Paid amount total thi vadhu na hoi shake"
        )

    shop_id = db.scalar(
        select(Shop.id).where(Shop.organization_id == org_id, Shop.is_default.is_(True))
    )

    # ---- everything below is ONE transaction: commit once at the end ----
    try:
        purchase = PurchaseInvoice(
            organization_id=org_id,
            shop_id=shop_id,
            supplier_id=supplier.id,
            created_by=user.id,
            invoice_number=data.invoice_number.strip(),
            idempotency_key=idempotency_key,
            purchase_date=data.purchase_date,
            subtotal=subtotal,
            tax_total=tax_total,
            grand_total=grand_total,
            paid_amount=data.paid_amount,
            payment_method=data.payment_method,
            status="confirmed",
            notes=(data.notes or "").strip() or None,
        )
        db.add(purchase)
        db.flush()

        for it, tax, line_total in lines:
            batch = (it.batch_no or "").strip() or None
            db.add(
                PurchaseItem(
                    organization_id=org_id,
                    purchase_id=purchase.id,
                    product_id=it.product_id,
                    quantity=it.quantity,
                    rate=it.rate,
                    tax_percent=it.tax_percent,
                    tax_amount=tax,
                    line_total=line_total,
                    batch_no=batch,
                    expiry_date=it.expiry_date,
                )
            )
            db.add(
                InventoryMovement(
                    organization_id=org_id,
                    shop_id=shop_id,
                    product_id=it.product_id,
                    movement_type="purchase",
                    quantity=it.quantity,
                    batch_no=batch,
                    expiry_date=it.expiry_date,
                    reference_type="purchase",
                    reference_id=purchase.id,
                    created_by=user.id,
                )
            )

        # We owe the supplier the full amount
        if grand_total > 0:
            db.add(
                SupplierLedger(
                    organization_id=org_id,
                    supplier_id=supplier.id,
                    entry_type="purchase",
                    credit=grand_total,
                    reference_type="purchase",
                    reference_id=purchase.id,
                    note=f"Invoice {purchase.invoice_number}",
                    created_by=user.id,
                )
            )

        # Part/full payment made at purchase time
        if data.paid_amount > 0:
            db.add(
                SupplierLedger(
                    organization_id=org_id,
                    supplier_id=supplier.id,
                    entry_type="payment",
                    debit=data.paid_amount,
                    reference_type="purchase",
                    reference_id=purchase.id,
                    payment_method=data.payment_method,
                    note=f"Paid with invoice {purchase.invoice_number}",
                    created_by=user.id,
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()  # nothing is saved
        # Two identical requests at the same moment: return the one that won
        winner = _find_by_key(db, org_id, idempotency_key)
        if winner:
            return _to_out(db, winner)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Aa supplier no aa invoice number pehla thi che",
        )

    return _to_out(db, purchase)


@router.get("", response_model=list[PurchaseOut])
def list_purchases(
    supplier_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    stmt = select(PurchaseInvoice).where(PurchaseInvoice.organization_id == org_id)
    if supplier_id:
        stmt = stmt.where(PurchaseInvoice.supplier_id == supplier_id)
    rows = db.scalars(
        stmt.order_by(
            PurchaseInvoice.purchase_date.desc(), PurchaseInvoice.created_at.desc()
        ).limit(limit)
    ).all()
    return [_to_out(db, p) for p in rows]


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(
    purchase_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    p = db.scalar(
        select(PurchaseInvoice).where(
            PurchaseInvoice.id == purchase_id,
            PurchaseInvoice.organization_id == _org_id(user),
        )
    )
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Purchase not found")
    return _to_out(db, p)