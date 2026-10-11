import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import Supplier, SupplierLedger, User
from app.schemas.supplier_ledger import LedgerOut, LedgerRow, PaymentCreate, PaymentOut

router = APIRouter(prefix="/api/v1/suppliers", tags=["supplier ledger"])

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


def _supplier(db: Session, org_id: uuid.UUID, supplier_id: uuid.UUID, lock: bool = False):
    stmt = select(Supplier).where(Supplier.id == supplier_id, Supplier.organization_id == org_id)
    if lock:
        stmt = stmt.with_for_update()
    s = db.scalar(stmt)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplier not found")
    return s


def outstanding(db: Session, org_id: uuid.UUID, s: Supplier) -> Decimal:
    row = db.execute(
        select(
            func.coalesce(func.sum(SupplierLedger.credit), 0),
            func.coalesce(func.sum(SupplierLedger.debit), 0),
        ).where(
            SupplierLedger.organization_id == org_id,
            SupplierLedger.supplier_id == s.id,
        )
    ).one()
    return s.opening_balance + Decimal(row[0]) - Decimal(row[1])


@router.post(
    "/{supplier_id}/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED
)
def create_payment(
    supplier_id: uuid.UUID,
    data: PaymentCreate,
    idempotency_key: str = Header(min_length=8, max_length=100, alias="Idempotency-Key"),
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    s = _supplier(db, org_id, supplier_id, lock=True)  # serialize payments per supplier

    existing = db.scalar(
        select(SupplierLedger).where(
            SupplierLedger.organization_id == org_id,
            SupplierLedger.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return PaymentOut(
            id=existing.id, amount=existing.debit, outstanding=outstanding(db, org_id, s)
        )

    due = outstanding(db, org_id, s)
    if data.amount > due:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Payment baaki rakam thi vadhu che. Baaki: {due}",
        )

    entry = SupplierLedger(
        organization_id=org_id,
        supplier_id=s.id,
        entry_type="payment",
        debit=data.amount,
        payment_method=data.payment_method,
        note=(data.note or "").strip() or None,
        idempotency_key=idempotency_key,
        created_by=user.id,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Duplicate request")
    return PaymentOut(id=entry.id, amount=entry.debit, outstanding=outstanding(db, org_id, s))


@router.get("/{supplier_id}/ledger", response_model=LedgerOut)
def get_ledger(
    supplier_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    org_id = _org_id(user)
    s = _supplier(db, org_id, supplier_id)
    entries = db.scalars(
        select(SupplierLedger)
        .where(SupplierLedger.organization_id == org_id, SupplierLedger.supplier_id == s.id)
        .order_by(SupplierLedger.created_at, SupplierLedger.id)
    ).all()

    balance = s.opening_balance
    rows = []
    for e in entries:
        balance = balance + e.credit - e.debit
        rows.append(
            LedgerRow(
                id=e.id,
                created_at=e.created_at,
                entry_type=e.entry_type,
                debit=e.debit,
                credit=e.credit,
                balance=balance,
                note=e.note,
            )
        )
    return LedgerOut(
        supplier_id=s.id, opening_balance=s.opening_balance, outstanding=balance, items=rows
    )