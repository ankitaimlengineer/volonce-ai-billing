import uuid
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.models import Organization, User

bearer_scheme = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def require_roles(*allowed_roles: str):
    """Allow only users whose role is in allowed_roles (super_admin always allowed)."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role != "super_admin" and user.role not in allowed_roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission")
        return user

    return checker


def require_setup_completed(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Block normal APIs until the Business Setup Wizard is completed."""
    if user.role == "super_admin":
        return user
    org = db.get(Organization, user.organization_id) if user.organization_id else None
    if org is None or not org.setup_completed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Business setup not completed")
    return user


def require_active_subscription(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Blocks billing APIs if the 5-day free trial or paid subscription has expired."""
    # Super admin can always test and generate bills without restrictions
    if user.role == "super_admin":
        return user

    if not user.organization_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No business linked to this user")

    # Dynamic import to avoid circular dependency
    from app.modules.subscription.router import get_or_create_org_subscription

    sub = get_or_create_org_subscription(db, user.organization_id)
    now = datetime.now(timezone.utc)

    if sub.status != "active" or sub.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="તમારો ૫-દિવસનો ફ્રી ટ્રાયલ અથવા સબસ્ક્રિપ્શન સમાપ્ત થઈ ગયું છે. નવું બિલ બનાવવા માટે કૃપા કરીને સબસ્ક્રિપ્શન પ્લાન ખરીદો.",
        )
    return user