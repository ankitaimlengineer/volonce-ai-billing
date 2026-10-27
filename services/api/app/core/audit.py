import uuid
from typing import Any
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog

def log_activity(
    db: Session,
    action: str,
    resource_type: str,
    organization_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """સુરક્ષિત ઓડિટ લોગ ઉમેરે છે."""
    try:
        log = AuditLog(
            organization_id=organization_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip_address=ip_address,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print("Audit log error:", e)
        db.rollback()