import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import (
    Customer,
    CustomerLedger,
    Expense,
    InventoryMovement,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    Product,
    PurchaseInvoice,
    PurchaseReturn,
    SalesReturn,
    SalesReturnItem,
    Supplier,
    SupplierLedger,
    User,
)
from app.schemas.report import Summary

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])
can_read = require_roles("owner", "manager", "accountant")
ZERO = Decimal("0")
CENT = Decimal("0.01")


def _user(user: User = Depends(can_read), _s: User = Depends(require_setup_completed)) -> User:
    return user


def _org_id(user: User) -> uuid.UUID:
    if user.organization_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No business linked to this user")
    return user.organization_id


def _d(v) -> Decimal:
    return Decimal(v or 0)


def compute_summary(db: Session, org_id: uuid.UUID, d1: date, d2: date) -> Summary:
    # ---- Sales (invoices in period) ----
    inv = db.execute(
        select(
            func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.grand_total), 0),
            func.coalesce(func.sum(Invoice.subtotal - Invoice.discount_total), 0),
        ).where(
            Invoice.organization_id == org_id,
            Invoice.status == "confirmed",
            Invoice.invoice_date.between(d1, d2),
        )
    ).one()
    bills, gross_sales, net_of_tax = int(inv[0]), _d(inv[1]), _d(inv[2])

    # Cost of goods sold from the cost snapshot saved on each bill line
    cogs = _d(
        db.scalar(
            select(func.coalesce(func.sum(InvoiceItem.quantity * InvoiceItem.purchase_price), 0))
            .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
            .where(
                Invoice.organization_id == org_id,
                Invoice.status == "confirmed",
                Invoice.invoice_date.between(d1, d2),
            )
        )
    )

    # ---- Sales returns in period ----
    ret_rows = db.execute(
        select(
            SalesReturnItem.line_total,
            SalesReturnItem.quantity,
            InvoiceItem.quantity,
            InvoiceItem.line_total,
            InvoiceItem.tax_amount,
            InvoiceItem.purchase_price,
        )
        .join(SalesReturn, SalesReturn.id == SalesReturnItem.return_id)
        .join(InvoiceItem, InvoiceItem.id == SalesReturnItem.invoice_item_id)
        .where(SalesReturn.organization_id == org_id, SalesReturn.return_date.between(d1, d2))
    ).all()
    ret_total = ret_net = ret_cogs = ZERO
    for refund, rq, oq, oline, otax, ocost in ret_rows:
        refund, rq, oq = _d(refund), _d(rq), _d(oq)
        ratio = rq / oq if oq else ZERO
        ret_total += refund
        ret_net += refund - _d(otax) * ratio  # tax-free part of the refund
        ret_cogs += _d(ocost) * rq

    sales = gross_sales - ret_total
    cogs_net = cogs - ret_cogs
    gross_profit = (net_of_tax - ret_net) - cogs_net

    # ---- Collections (money received in period) ----
    at_bill = _d(
        db.scalar(
            select(func.coalesce(func.sum(InvoicePayment.amount), 0))
            .join(Invoice, Invoice.id == InvoicePayment.invoice_id)
            .where(
                InvoicePayment.organization_id == org_id,
                Invoice.invoice_date.between(d1, d2),
            )
        )
    )
    later = _d(
        db.scalar(
            select(func.coalesce(func.sum(CustomerLedger.credit), 0)).where(
                CustomerLedger.organization_id == org_id,
                CustomerLedger.entry_type == "payment",
                CustomerLedger.reference_type.is_(None),  # standalone payments
                func.date(CustomerLedger.created_at).between(d1, d2),
            )
        )
    )

    # ---- Purchases ----
    pur = _d(
        db.scalar(
            select(func.coalesce(func.sum(PurchaseInvoice.grand_total), 0)).where(
                PurchaseInvoice.organization_id == org_id,
                PurchaseInvoice.status == "confirmed",
                PurchaseInvoice.purchase_date.between(d1, d2),
            )
        )
    )
    pur_ret = _d(
        db.scalar(
            select(func.coalesce(func.sum(PurchaseReturn.grand_total), 0)).where(
                PurchaseReturn.organization_id == org_id,
                PurchaseReturn.return_date.between(d1, d2),
            )
        )
    )

    # ---- Expenses ----
    expenses = _d(
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.organization_id == org_id,
                Expense.status == "active",
                Expense.expense_date.between(d1, d2),
            )
        )
    )

    # ---- Receivable / payable (as of now) ----
    cust_open = _d(
        db.scalar(
            select(func.coalesce(func.sum(Customer.opening_balance), 0)).where(
                Customer.organization_id == org_id
            )
        )
    )
    cl = db.execute(
        select(
            func.coalesce(func.sum(CustomerLedger.debit), 0),
            func.coalesce(func.sum(CustomerLedger.credit), 0),
        ).where(CustomerLedger.organization_id == org_id)
    ).one()
    receivable = cust_open + _d(cl[0]) - _d(cl[1])

    sup_open = _d(
        db.scalar(
            select(func.coalesce(func.sum(Supplier.opening_balance), 0)).where(
                Supplier.organization_id == org_id
            )
        )
    )
    sl = db.execute(
        select(
            func.coalesce(func.sum(SupplierLedger.credit), 0),
            func.coalesce(func.sum(SupplierLedger.debit), 0),
        ).where(SupplierLedger.organization_id == org_id)
    ).one()
    payable = sup_open + _d(sl[0]) - _d(sl[1])

    # ---- Stock (one query) ----
    stock_sq = (
        select(
            InventoryMovement.product_id.label("pid"),
            func.sum(InventoryMovement.quantity).label("qty"),
        )
        .where(InventoryMovement.organization_id == org_id)
        .group_by(InventoryMovement.product_id)
        .subquery()
    )
    rows = db.execute(
        select(Product.purchase_price, Product.min_stock, func.coalesce(stock_sq.c.qty, 0))
        .outerjoin(stock_sq, stock_sq.c.pid == Product.id)
        .where(Product.organization_id == org_id, Product.is_active.is_(True))
    ).all()
    stock_value = low = out = 0
    stock_value = ZERO
    for price, min_stock, qty in rows:
        qty = _d(qty)
        if qty <= 0:
            out += 1
        else:
            stock_value += qty * _d(price)
            if qty <= _d(min_stock):
                low += 1

    margin = (gross_profit / (net_of_tax - ret_net) * 100) if (net_of_tax - ret_net) > 0 else ZERO

    return Summary(
        date_from=d1.isoformat(),
        date_to=d2.isoformat(),
        sales=sales.quantize(CENT),
        bills=bills,
        collections=(at_bill + later).quantize(CENT),
        purchases=(pur - pur_ret).quantize(CENT),
        cogs=cogs_net.quantize(CENT),
        gross_profit=gross_profit.quantize(CENT),
        margin_percent=margin.quantize(CENT),
        expenses=expenses.quantize(CENT),
        net_profit=(gross_profit - expenses).quantize(CENT),
        receivable=receivable.quantize(CENT),
        payable=payable.quantize(CENT),
        stock_value=stock_value.quantize(CENT),
        low_stock=low,
        out_of_stock=out,
    )


@router.get("/summary", response_model=Summary)
def summary(
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(_user),
    db: Session = Depends(get_db),
):
    d1 = date_from or date.today()
    d2 = date_to or d1
    if d2 < d1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "date_to date_from thi pehla na hoi shake")
    if (d2 - d1).days > 800:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Period bahu moto che")
    return compute_summary(db, _org_id(user), d1, d2)