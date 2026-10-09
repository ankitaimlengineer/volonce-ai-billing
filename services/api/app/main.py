import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.modules.auth.router import router as auth_router
from app.modules.business.branding import router as branding_router
from app.modules.business.router import router as business_router
from app.modules.debug.router import router as debug_router

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
app.include_router(debug_router)


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