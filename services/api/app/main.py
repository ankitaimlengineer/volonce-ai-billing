import logging

from fastapi import FastAPI
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title=settings.app_name, version="0.1.0")


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