import uuid
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import (
    get_db,
    require_active_subscription,
    require_roles,
    require_setup_completed,
)
from app.models import (
    BusinessSettings,
    Customer,
    CustomerLedger,
    InventoryMovement,
    Invoice,
    InvoiceCounter,
    InvoiceItem,
    InvoicePayment,
    Product,
    Shop,
    User,
)
from app.schemas.invoice import InvoiceCreate, InvoiceItemOut, InvoiceOut, PaymentOut

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])

can_read = require_setup_completed
can_write = require_roles("owner", "manager", "cashier")
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


def _financial_year(d: date) -> str:
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _to_out(db: Session, inv: Invoice) -> InvoiceOut:
    items = db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == inv.id)).all()
    pays = db.scalars(select(InvoicePayment).where(InvoicePayment.invoice_id == inv.id)).all()
    out = InvoiceOut.model_validate(inv, from_attributes=True)
    out.items = [InvoiceItemOut.model_validate(i, from_attributes=True) for i in items]
    out.payments = [PaymentOut.model_validate(p, from_attributes=True) for p in pays]
    return out


def _find_by_key(db: Session, org_id: uuid.UUID, key: str) -> Invoice | None:
    return db.scalar(
        select(Invoice).where(Invoice.organization_id == org_id, Invoice.idempotency_key == key)
    )


def _next_number(db: Session, org_id: uuid.UUID, today: date) -> str:
    """Concurrency-safe: the counter row is locked until this transaction ends."""
    fy = _financial_year(today)
    # Make sure the row exists (no-op if it already does)
    db.execute(
        pg_insert(InvoiceCounter)
        .values(organization_id=org_id, financial_year=fy, last_number=0)
        .on_conflict_do_nothing()
    )
    counter = db.scalar(
        select(InvoiceCounter)
        .where(InvoiceCounter.organization_id == org_id, InvoiceCounter.financial_year == fy)
        .with_for_update()
    )
    counter.last_number += 1
    settings = db.scalar(
        select(BusinessSettings).where(BusinessSettings.organization_id == org_id)
    )
    prefix = settings.invoice_prefix if settings else "INV"
    pad = settings.invoice_number_padding if settings else 5
    return f"{prefix}{str(counter.last_number).zfill(pad)}"


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(
    data: InvoiceCreate,
    idempotency_key: str = Header(min_length=8, max_length=100, alias="Idempotency-Key"),
    user: User = Depends(_write_user),
    _sub: User = Depends(require_active_subscription),  # લિમિટ ગાર્ડ: પ્લાન ન હોય તો બિલિંગ બ્લોક થશે!
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)

    existing = _find_by_key(db, org_id, idempotency_key)
    if existing:
        return _to_out(db, existing)

    customer = None
    if data.customer_id:
        customer = db.scalar(
            select(Customer)
            .where(
                Customer.id == data.customer_id,
                Customer.organization_id == org_id,
                Customer.is_active.is_(True),
            )
            .with_for_update()  # serialize this customer's credit check
        )
        if customer is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid customer")

    # Merge duplicate product lines (same product + same discount)
    merged: dict[tuple, Decimal] = {}
    for it in data.items:
        key = (it.product_id, it.discount_percent)
        merged[key] = merged.get(key, Decimal("0")) + it.quantity

    # Lock products in fixed order (stock safety + no deadlock)
    product_ids = sorted({k[0] for k in merged}, key=str)
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

    # Stock check (total qty per product)
    need: dict[uuid.UUID, Decimal] = {}
    for (pid, _d), qty in merged.items():
        need[pid] = need.get(pid, Decimal("0")) + qty
    for pid, qty in need.items():
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
                f"{products[pid].name}: stock ochho che. Stock: {balance}",
            )

    # Totals: rate comes from the CATALOG, never from the client
    lines = []
    subtotal = discount_total = tax_total = Decimal("0")
    for (pid, disc_pct), qty in merged.items():
        p = products[pid]
        base = _money(qty * p.selling_price)
        disc = _money(base * disc_pct / Decimal("100"))
        taxable = base - disc
        tax = _money(taxable * p.tax_percent / Decimal("100"))
        subtotal += base
        discount_total += disc
        tax_total += tax
        lines.append((p, qty, disc, tax, taxable + tax))
    grand_total = subtotal - discount_total + tax_total

    paid = sum((pay.amount for pay in data.payments), Decimal("0"))
    if paid > grand_total:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Paid amount total thi vadhu na hoi shake"
        )
    due = grand_total - paid
    if due > 0:
        if customer is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Walk-in customer ma poori payment jaruri che. Udhar mate customer select karo.",
            )
        if customer.credit_limit is not None:
            row = db.execute(
                select(
                    func.coalesce(func.sum(CustomerLedger.debit), 0),
                    func.coalesce(func.sum(CustomerLedger.credit), 0),
                ).where(
                    CustomerLedger.organization_id == org_id,
                    CustomerLedger.customer_id == customer.id,
                )
            ).one()
            current = customer.opening_balance + Decimal(row[0]) - Decimal(row[1])
            if current + due > customer.credit_limit:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"Credit limit vadhi jashe. Limit: {customer.credit_limit}, baaki: {current}",
                )

    shop_id = db.scalar(
        select(Shop.id).where(Shop.organization_id == org_id, Shop.is_default.is_(True))
    )
    today = date.today()

    # ---- ONE transaction: commit once at the end ----
    try:
        number = _next_number(db, org_id, today)
        inv = Invoice(
            organization_id=org_id,
            shop_id=shop_id,
            customer_id=customer.id if customer else None,
            created_by=user.id,
            invoice_number=number,
            idempotency_key=idempotency_key,
            invoice_date=today,
            subtotal=subtotal,
            discount_total=discount_total,
            tax_total=tax_total,
            grand_total=grand_total,
            paid_amount=paid,
            status="confirmed",
            notes=(data.notes or "").strip() or None,
        )
        db.add(inv)
        db.flush()

        for p, qty, disc, tax, line_total in lines:
            db.add(
                InvoiceItem(
                    organization_id=org_id,
                    invoice_id=inv.id,
                    product_id=p.id,
                    product_name=p.name,
                    quantity=qty,
                    rate=p.selling_price,
                    discount_amount=disc,
                    tax_percent=p.tax_percent,
                    tax_amount=tax,
                    line_total=line_total,
                    purchase_price=p.purchase_price,
                )
            )
            db.add(
                InventoryMovement(
                    organization_id=org_id,
                    shop_id=shop_id,
                    product_id=p.id,
                    movement_type="sale",
                    quantity=-qty,
                    reference_type="invoice",
                    reference_id=inv.id,
                    created_by=user.id,
                )
            )

        for pay in data.payments:
            db.add(
                InvoicePayment(
                    organization_id=org_id,
                    invoice_id=inv.id,
                    method=pay.method,
                    amount=pay.amount,
                )
            )

        # Customer ledger (walk-in has no ledger)
        if customer is not None:
            if grand_total > 0:
                db.add(
                    CustomerLedger(
                        organization_id=org_id,
                        customer_id=customer.id,
                        entry_type="sale",
                        debit=grand_total,
                        reference_type="invoice",
                        reference_id=inv.id,
                        note=f"Invoice {number}",
                        created_by=user.id,
                    )
                )
            if paid > 0:
                db.add(
                    CustomerLedger(
                        organization_id=org_id,
                        customer_id=customer.id,
                        entry_type="payment",
                        credit=paid,
                        reference_type="invoice",
                        reference_id=inv.id,
                        payment_method=data.payments[0].method,
                        note=f"Paid with invoice {number}",
                        created_by=user.id,
                    )
                )
        db.commit()
    except IntegrityError:
        db.rollback()
        winner = _find_by_key(db, org_id, idempotency_key)
        if winner:
            return _to_out(db, winner)
        raise HTTPException(status.HTTP_409_CONFLICT, "Invoice save thayu nathi")

    return _to_out(db, inv)


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    customer_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    stmt = select(Invoice).where(Invoice.organization_id == org_id)
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    rows = db.scalars(
        stmt.order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc()).limit(limit)
    ).all()
    return [_to_out(db, i) for i in rows]


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    inv = db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id, Invoice.organization_id == _org_id(user)
        )
    )
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return _to_out(db, inv)