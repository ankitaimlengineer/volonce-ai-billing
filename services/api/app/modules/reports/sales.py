import csv
import io
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import (
    Customer,
    Expense,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    SalesReturn,
    User,
)
from app.modules.reports.summary import (
    CENT,
    _d,
    _org_id,
    _user,
    compute_summary,
)

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


def _period(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    d1 = date_from or date.today()
    d2 = date_to or d1
    if d2 < d1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "date_to date_from thi pehla na hoi shake")
    if (d2 - d1).days > 800:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Period bahu moto che")
    return d1, d2


def _safe(v) -> str:
    """Stop Excel from running a cell as a formula (CSV injection)."""
    t = "" if v is None else str(v)
    return "'" + t if t and t[0] in ("=", "+", "-", "@", "\t", "\r") else t


def _csv_response(rows: list[list], header: list[str], name: str) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow([_safe(x) for x in r])
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/sales")
def sales_report(
    date_from: date | None = None,
    date_to: date | None = None,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    user: User = Depends(_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    d1, d2 = _period(date_from, date_to)
    base = [
        Invoice.organization_id == org_id,
        Invoice.status == "confirmed",
        Invoice.invoice_date.between(d1, d2),
    ]

    # Day-wise
    daily = db.execute(
        select(
            Invoice.invoice_date,
            func.count(Invoice.id),
            func.sum(Invoice.grand_total),
            func.sum(Invoice.discount_total),
            func.sum(Invoice.tax_total),
            func.sum(Invoice.paid_amount),
        )
        .where(*base)
        .group_by(Invoice.invoice_date)
        .order_by(Invoice.invoice_date)
    ).all()

    # Product-wise
    products = db.execute(
        select(
            InvoiceItem.product_name,
            func.sum(InvoiceItem.quantity),
            func.sum(InvoiceItem.line_total),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .where(*base)
        .group_by(InvoiceItem.product_name)
        .order_by(func.sum(InvoiceItem.line_total).desc())
        .limit(200)
    ).all()

    # Customer-wise (walk-in = NULL)
    customers = db.execute(
        select(Customer.name, func.count(Invoice.id), func.sum(Invoice.grand_total))
        .select_from(Invoice)
        .outerjoin(Customer, Customer.id == Invoice.customer_id)
        .where(*base)
        .group_by(Customer.name)
        .order_by(func.sum(Invoice.grand_total).desc())
        .limit(200)
    ).all()

    # Payment-wise
    payments = db.execute(
        select(InvoicePayment.method, func.sum(InvoicePayment.amount))
        .join(Invoice, Invoice.id == InvoicePayment.invoice_id)
        .where(*base)
        .group_by(InvoicePayment.method)
    ).all()

    returns = _d(
        db.scalar(
            select(func.coalesce(func.sum(SalesReturn.grand_total), 0)).where(
                SalesReturn.organization_id == org_id,
                SalesReturn.return_date.between(d1, d2),
            )
        )
    )

    q = lambda v: str(_d(v).quantize(CENT))  # noqa: E731
    total_sales = sum((_d(r[2]) for r in daily), Decimal("0"))

    if format == "csv":
        rows: list[list] = []
        for r in daily:
            rows.append(["day", r[0].isoformat(), r[1], q(r[2]), q(r[3]), q(r[4]), q(r[5])])
        for r in products:
            rows.append(["product", r[0], "", q(r[2]), "", "", f"qty {_d(r[1]).normalize():f}"])
        for r in customers:
            rows.append(["customer", r[0] or "Walk-in", r[1], q(r[2]), "", "", ""])
        for r in payments:
            rows.append(["payment", r[0], "", q(r[1]), "", "", ""])
        rows.append(["sales_return", "", "", q(returns), "", "", ""])
        return _csv_response(
            rows,
            ["section", "name", "bills", "amount", "discount", "tax", "note"],
            f"sales_{d1}_{d2}.csv",
        )

    return {
        "date_from": d1.isoformat(),
        "date_to": d2.isoformat(),
        "total_sales": q(total_sales),
        "sales_return": q(returns),
        "net_sales": q(total_sales - returns),
        "daily": [
            {"date": r[0].isoformat(), "bills": r[1], "sales": q(r[2]),
             "discount": q(r[3]), "tax": q(r[4]), "collected": q(r[5])}
            for r in daily
        ],
        "products": [{"name": r[0], "quantity": str(_d(r[1])), "amount": q(r[2])} for r in products],
        "customers": [{"name": r[0] or "Walk-in", "bills": r[1], "amount": q(r[2])} for r in customers],
        "payments": [{"method": r[0], "amount": q(r[1])} for r in payments],
    }


@router.get("/profit-loss")
def profit_loss(
    date_from: date | None = None,
    date_to: date | None = None,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    user: User = Depends(_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    d1, d2 = _period(date_from, date_to)
    s = compute_summary(db, org_id, d1, d2)  # same numbers as the dashboard

    cats = db.execute(
        select(Expense.category, func.sum(Expense.amount))
        .where(
            Expense.organization_id == org_id,
            Expense.status == "active",
            Expense.expense_date.between(d1, d2),
        )
        .group_by(Expense.category)
        .order_by(func.sum(Expense.amount).desc())
    ).all()

    if format == "csv":
        rows = [
            ["Total Sales", s.sales],
            ["Cost of Goods Sold", s.cogs],
            ["Gross Profit", s.gross_profit],
            ["Profit Margin %", s.margin_percent],
        ]
        for c, a in cats:
            rows.append([f"Expense: {c}", str(_d(a).quantize(CENT))])
        rows += [["Total Expenses", s.expenses], ["Net Profit", s.net_profit]]
        return _csv_response(rows, ["item", "amount"], f"profit_loss_{d1}_{d2}.csv")

    return {
        "date_from": s.date_from,
        "date_to": s.date_to,
        "sales": str(s.sales),
        "cogs": str(s.cogs),
        "gross_profit": str(s.gross_profit),
        "margin_percent": str(s.margin_percent),
        "expense_categories": [
            {"category": c, "amount": str(_d(a).quantize(CENT))} for c, a in cats
        ],
        "expenses": str(s.expenses),
        "net_profit": str(s.net_profit),
    }