import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import Expense, User
from app.schemas.expense import ExpenseCreate, ExpenseList, ExpenseOut

router = APIRouter(prefix="/api/v1/expenses", tags=["expenses"])

can_read = require_roles("owner", "manager", "accountant")


def _org_id(user: User) -> uuid.UUID:
    if user.organization_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No business linked to this user")
    return user.organization_id


def _user(
    user: User = Depends(can_read), _setup: User = Depends(require_setup_completed)
) -> User:
    return user


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    data: ExpenseCreate,
    idempotency_key: str = Header(min_length=8, max_length=100, alias="Idempotency-Key"),
    user: User = Depends(_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    existing = db.scalar(
        select(Expense).where(
            Expense.organization_id == org_id, Expense.idempotency_key == idempotency_key
        )
    )
    if existing:
        return existing
    exp = Expense(
        organization_id=org_id,
        created_by=user.id,
        idempotency_key=idempotency_key,
        category=data.category,
        amount=data.amount,
        expense_date=data.expense_date,
        payment_method=data.payment_method,
        notes=(data.notes or "").strip() or None,
    )
    db.add(exp)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        winner = db.scalar(
            select(Expense).where(
                Expense.organization_id == org_id, Expense.idempotency_key == idempotency_key
            )
        )
        if winner:
            return winner
        raise HTTPException(status.HTTP_409_CONFLICT, "Expense save thayu nathi")
    return exp


@router.get("", response_model=ExpenseList)
def list_expenses(
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = Query(default=None, max_length=20),
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    stmt = select(Expense).where(Expense.organization_id == org_id)
    if date_from:
        stmt = stmt.where(Expense.expense_date >= date_from)
    if date_to:
        stmt = stmt.where(Expense.expense_date <= date_to)
    if category:
        stmt = stmt.where(Expense.category == category)
    items = db.scalars(
        stmt.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).limit(limit)
    ).all()
    total = sum((e.amount for e in items if e.status == "active"), Decimal("0"))
    return ExpenseList(items=items, total_amount=total)


@router.post("/{expense_id}/cancel", response_model=ExpenseOut)
def cancel_expense(
    expense_id: uuid.UUID, user: User = Depends(_user), db: Session = Depends(get_db)
):
    # Soft cancel: the record stays for the audit trail
    exp = db.scalar(
        select(Expense).where(Expense.id == expense_id, Expense.organization_id == _org_id(user))
    )
    if exp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    exp.status = "cancelled"
    db.commit()
    return exp