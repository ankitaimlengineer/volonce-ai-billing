import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_roles
from app.models import AuditLog, User
from app.modules.admin.router import require_super_admin

router = APIRouter(prefix="/api/v1/audit", tags=["audit-logs"])


class AuditLogRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    resource_type: str
    resource_id: str | None = None
    details: dict | None = None
    ip_address: str | None = None
    created_at: datetime


@router.get("/business", response_model=list[AuditLogRow])
def get_business_audit_logs(
    limit: int = Query(default=50, le=200),
    user: User = Depends(require_roles("owner", "manager")),
    db: Session = Depends(get_db),
):
    """દુકાન માલિક માટે પોતાની દુકાનની પ્રવૃત્તિઓની હિસ્ટ્રી."""
    logs = db.scalars(
        select(AuditLog)
        .where(AuditLog.organization_id == user.organization_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    ).all()
    return logs


@router.get("/admin", response_model=list[AuditLogRow])
def get_admin_audit_logs(
    limit: int = Query(default=100, le=500),
    _admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """સુપર એડમિન માટે આખા પ્લેટફોર્મની ઓડિટ હિસ્ટ્રી."""
    logs = db.scalars(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    ).all()
    return logs