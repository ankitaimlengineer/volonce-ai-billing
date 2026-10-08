import uuid

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