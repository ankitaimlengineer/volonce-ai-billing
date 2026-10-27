import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import Customer, CustomerLedger, User
from app.schemas.customer import (
    CustomerCreate,
    CustomerLedgerOut,
    CustomerLedgerRow,
    CustomerList,
    CustomerOut,
    CustomerPaymentCreate,
    CustomerPaymentOut,
    CustomerRow,
    CustomerUpdate,
)

router = APIRouter(prefix="/api/v1/customers", tags=["customers"])

can_read = require_setup_completed
# Cashier can also create customers and take payments
can_write = require_roles("owner", "manager", "cashier")


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
    for key in ("mobile", "email", "address", "notes"):
        if isinstance(values.get(key), str):
            values[key] = values[key].strip() or None
    return values


def _get(db: Session, org_id: uuid.UUID, customer_id: uuid.UUID, lock: bool = False) -> Customer:
    stmt = select(Customer).where(Customer.id == customer_id, Customer.organization_id == org_id)
    if lock:
        stmt = stmt.with_for_update()
    c = db.scalar(stmt)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return c


def outstanding(db: Session, org_id: uuid.UUID, c: Customer) -> Decimal:
    row = db.execute(
        select(
            func.coalesce(func.sum(CustomerLedger.debit), 0),
            func.coalesce(func.sum(CustomerLedger.credit), 0),
        ).where(CustomerLedger.organization_id == org_id, CustomerLedger.customer_id == c.id)
    ).one()
    return c.opening_balance + Decimal(row[0]) - Decimal(row[1])


@router.get("", response_model=CustomerList)
def list_customers(
    q: str | None = Query(default=None, max_length=100),
    include_inactive: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    stmt = select(Customer).where(Customer.organization_id == org_id)
    if not include_inactive:
        stmt = stmt.where(Customer.is_active.is_(True))
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.mobile.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Customer.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    sums = {
        cid: (Decimal(d), Decimal(c))
        for cid, d, c in db.execute(
            select(
                CustomerLedger.customer_id,
                func.coalesce(func.sum(CustomerLedger.debit), 0),
                func.coalesce(func.sum(CustomerLedger.credit), 0),
            )
            .where(
                CustomerLedger.organization_id == org_id,
                CustomerLedger.customer_id.in_([c.id for c in items]),
            )
            .group_by(CustomerLedger.customer_id)
        ).all()
    }
    rows = []
    for c in items:
        d, cr = sums.get(c.id, (Decimal("0"), Decimal("0")))
        row = CustomerRow.model_validate(c, from_attributes=True)
        row.outstanding = c.opening_balance + d - cr
        rows.append(row)
    return CustomerList(items=rows, total=total, page=page, page_size=page_size)


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    data: CustomerCreate, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    customer = Customer(
        organization_id=_org_id(user), created_by=user.id, **_clean(data.model_dump())
    )
    db.add(customer)
    db.commit()
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    return _get(db, _org_id(user), customer_id)


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: uuid.UUID,
    data: CustomerUpdate,
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    customer = _get(db, _org_id(user), customer_id)
    for field, value in _clean(data.model_dump()).items():
        setattr(customer, field, value)
    db.commit()
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: uuid.UUID, user: User = Depends(_write_user), db: Session = Depends(get_db)
):
    # Soft delete: old invoices and ledger keep pointing to this customer
    customer = _get(db, _org_id(user), customer_id)
    customer.is_active = False
    db.commit()


@router.post(
    "/{customer_id}/payments",
    response_model=CustomerPaymentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_payment(
    customer_id: uuid.UUID,
    data: CustomerPaymentCreate,
    idempotency_key: str = Header(min_length=8, max_length=100, alias="Idempotency-Key"),
    user: User = Depends(_write_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    c = _get(db, org_id, customer_id, lock=True)  # serialize payments per customer

    existing = db.scalar(
        select(CustomerLedger).where(
            CustomerLedger.organization_id == org_id,
            CustomerLedger.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return CustomerPaymentOut(
            id=existing.id, amount=existing.credit, outstanding=outstanding(db, org_id, c)
        )

    due = outstanding(db, org_id, c)
    if data.amount > due:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Payment baaki rakam thi vadhu che. Baaki: {due}",
        )

    entry = CustomerLedger(
        organization_id=org_id,
        customer_id=c.id,
        entry_type="payment",
        credit=data.amount,
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
    return CustomerPaymentOut(id=entry.id, amount=entry.credit, outstanding=outstanding(db, org_id, c))


@router.get("/{customer_id}/ledger", response_model=CustomerLedgerOut)
def get_ledger(
    customer_id: uuid.UUID, user: User = Depends(can_read), db: Session = Depends(get_db)
):
    org_id = _org_id(user)
    c = _get(db, org_id, customer_id)
    entries = db.scalars(
        select(CustomerLedger)
        .where(CustomerLedger.organization_id == org_id, CustomerLedger.customer_id == c.id)
        .order_by(CustomerLedger.created_at, CustomerLedger.id)
    ).all()

    balance = c.opening_balance
    rows = []
    for e in entries:
        balance = balance + e.debit - e.credit
        rows.append(
            CustomerLedgerRow(
                id=e.id,
                created_at=e.created_at,
                entry_type=e.entry_type,
                debit=e.debit,
                credit=e.credit,
                balance=balance,
                note=e.note,
            )
        )
    rows.reverse()
    return CustomerLedgerOut(
        customer_id=c.id, opening_balance=c.opening_balance, outstanding=balance, items=rows
    )