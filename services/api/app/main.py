import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.modules.auth.router import router as auth_router
from app.modules.business.branding import router as branding_router
from app.modules.business.router import router as business_router
from app.modules.catalog.images import router as product_images_router
from app.modules.catalog.router import router as catalog_router
from app.modules.debug.router import router as debug_router
from app.modules.inventory.router import router as inventory_router
from app.modules.purchase.invoices import router as purchases_router
from app.modules.purchase.ledger import router as supplier_ledger_router
from app.modules.purchase.returns import router as purchase_returns_router
from app.modules.purchase.suppliers import router as suppliers_router
from app.modules.sales.customers import router as customers_router
from app.modules.sales.invoices import router as invoices_router
from app.modules.sales.returns import router as sales_returns_router
from app.modules.reports.expenses import router as expenses_router
from app.modules.reports.summary import router as reports_router
from app.modules.reports.sales import router as sales_report_router
from app.modules.reports.cashflow import router as cashflow_router
from app.modules.ai.router import router as ai_router
from app.modules.whatsapp.router import router as whatsapp_router
from app.modules.whatsapp.router import router as whatsapp_router
from app.modules.subscription.router import router as subscription_router
from app.modules.admin.router import router as admin_router
from app.modules.audit.router import router as audit_router
from app.modules.notifications.router import router as notifications_router

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(business_router)
app.include_router(branding_router)
app.include_router(catalog_router)
app.include_router(product_images_router)
app.include_router(inventory_router)
app.include_router(suppliers_router)
app.include_router(supplier_ledger_router)
app.include_router(purchases_router)
app.include_router(purchase_returns_router)
app.include_router(customers_router)
app.include_router(invoices_router)
app.include_router(sales_returns_router)
app.include_router(debug_router)
app.include_router(expenses_router)
app.include_router(reports_router)
app.include_router(sales_report_router)
app.include_router(cashflow_router)
app.include_router(ai_router)
app.include_router(whatsapp_router)
app.include_router(whatsapp_router)
app.include_router(subscription_router)
app.include_router(admin_router)
app.include_router(notifications_router)
app.include_router(audit_router)


@app.get("/api/v1/health")
def health():
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        # Real error goes to the server log, not to the API response
        logger.error("Database health check failed: %s", exc)

    return {
        "status": "ok" if db_ok else "degraded",
        "database": "up" if db_ok else "down",
    }