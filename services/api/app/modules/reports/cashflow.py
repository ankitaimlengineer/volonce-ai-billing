from collections import defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import (
    CustomerLedger,
    Expense,
    Invoice,
    InvoicePayment,
    PurchaseInvoice,
    SupplierLedger,
    User,
)
from app.modules.reports.sales import _csv_response, _period
from app.modules.reports.summary import CENT, _d, _org_id, _user

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

METHODS = ["cash", "upi", "card", "bank_transfer"]


@router.get("/cash-flow")
def cash_flow(
    date_from: date | None = None,
    date_to: date | None = None,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    user: User = Depends(_user),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    d1, d2 = _period(date_from, date_to)

    # (direction, source label, method, amount)
    flows: list[tuple[str, str, str, Decimal]] = []

    # IN 1: payments taken while billing
    for method, amt in db.execute(
        select(InvoicePayment.method, func.sum(InvoicePayment.amount))
        .join(Invoice, Invoice.id == InvoicePayment.invoice_id)
        .where(
            InvoicePayment.organization_id == org_id,
            Invoice.status == "confirmed",
            Invoice.invoice_date.between(d1, d2),
        )
        .group_by(InvoicePayment.method)
    ).all():
        flows.append(("in", "Sales collection", method, _d(amt)))

    # IN 2: standalone customer payments (not the ones made with a bill)
    for method, amt in db.execute(
        select(CustomerLedger.payment_method, func.sum(CustomerLedger.credit))
        .where(
            CustomerLedger.organization_id == org_id,
            CustomerLedger.entry_type == "payment",
            CustomerLedger.reference_type.is_(None),
            func.date(CustomerLedger.created_at).between(d1, d2),
        )
        .group_by(CustomerLedger.payment_method)
    ).all():
        flows.append(("in", "Customer payments", method or "cash", _d(amt)))

    # OUT 1: paid while purchasing
    for method, amt in db.execute(
        select(PurchaseInvoice.payment_method, func.sum(PurchaseInvoice.paid_amount))
        .where(
            PurchaseInvoice.organization_id == org_id,
            PurchaseInvoice.status == "confirmed",
            PurchaseInvoice.purchase_date.between(d1, d2),
            PurchaseInvoice.paid_amount > 0,
        )
        .group_by(PurchaseInvoice.payment_method)
    ).all():
        flows.append(("out", "Purchases paid", method or "cash", _d(amt)))

    # OUT 2: standalone supplier payments
    for method, amt in db.execute(
        select(SupplierLedger.payment_method, func.sum(SupplierLedger.debit))
        .where(
            SupplierLedger.organization_id == org_id,
            SupplierLedger.entry_type == "payment",
            SupplierLedger.reference_type.is_(None),
            func.date(SupplierLedger.created_at).between(d1, d2),
        )
        .group_by(SupplierLedger.payment_method)
    ).all():
        flows.append(("out", "Supplier payments", method or "cash", _d(amt)))

    # OUT 3: expenses
    for method, amt in db.execute(
        select(Expense.payment_method, func.sum(Expense.amount))
        .where(
            Expense.organization_id == org_id,
            Expense.status == "active",
            Expense.expense_date.between(d1, d2),
        )
        .group_by(Expense.payment_method)
    ).all():
        flows.append(("out", "Expenses", method, _d(amt)))

    q = lambda v: str(Decimal(v).quantize(CENT))  # noqa: E731

    src_in: dict[str, Decimal] = defaultdict(Decimal)
    src_out: dict[str, Decimal] = defaultdict(Decimal)
    by_method = {m: {"in": Decimal("0"), "out": Decimal("0")} for m in METHODS}
    for direction, label, method, amt in flows:
        (src_in if direction == "in" else src_out)[label] += amt
        by_method.setdefault(method, {"in": Decimal("0"), "out": Decimal("0")})
        by_method[method][direction] += amt

    total_in = sum(src_in.values(), Decimal("0"))
    total_out = sum(src_out.values(), Decimal("0"))

    if format == "csv":
        rows: list[list] = [["Money In", k, q(v)] for k, v in src_in.items()]
        rows.append(["Money In", "TOTAL", q(total_in)])
        rows += [["Money Out", k, q(v)] for k, v in src_out.items()]
        rows.append(["Money Out", "TOTAL", q(total_out)])
        rows.append(["Net", "Net cash flow", q(total_in - total_out)])
        for m, v in by_method.items():
            rows.append([f"Method: {m}", "in / out / net",
                         f"{q(v['in'])} / {q(v['out'])} / {q(v['in'] - v['out'])}"])
        return _csv_response(rows, ["section", "item", "amount"], f"cash_flow_{d1}_{d2}.csv")

    return {
        "date_from": d1.isoformat(),
        "date_to": d2.isoformat(),
        "money_in": [{"source": k, "amount": q(v)} for k, v in src_in.items()],
        "total_in": q(total_in),
        "money_out": [{"source": k, "amount": q(v)} for k, v in src_out.items()],
        "total_out": q(total_out),
        "net": q(total_in - total_out),
        "by_method": [
            {"method": m, "in": q(v["in"]), "out": q(v["out"]), "net": q(v["in"] - v["out"])}
            for m, v in by_method.items()
        ],
    }