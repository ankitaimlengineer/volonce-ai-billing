from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models import BusinessSettings, Organization, RefreshToken, Shop, User
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _issue_tokens(db: Session, user: User, setup_completed: bool) -> TokenResponse:
    """Create access + refresh token. Only the refresh token HASH is stored."""
    raw_refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw_refresh),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_days),
        )
    )
    db.commit()

    access = create_access_token(
        str(user.id),
        str(user.organization_id) if user.organization_id else None,
        user.role,
    )
    return TokenResponse(
        access_token=access,
        refresh_token=raw_refresh,
        setup_completed=setup_completed,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Organization + default shop + settings + owner user: ONE transaction
    org = Organization(name=data.business_name, owner_name=data.full_name)
    db.add(org)
    db.flush()

    # Default shop + settings are created in the same transaction
    db.add(Shop(organization_id=org.id, name=org.name, is_default=True))
    db.add(
        BusinessSettings(
            organization_id=org.id,
            invoice_template="professional",
            invoice_prefix="INV",
            invoice_number_padding=5,
        )
    )

    user = User(
        organization_id=org.id,
        email=email,
        mobile=data.mobile,
        full_name=data.full_name,
        password_hash=hash_password(data.password),
        role="owner",
    )
    db.add(user)
    db.commit()

    return _issue_tokens(db, user, org.setup_completed)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    # Same error for wrong email or wrong password (no user enumeration)
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")

    org = db.get(Organization, user.organization_id) if user.organization_id else None
    return _issue_tokens(db, user, org.setup_completed if org else False)


@router.post("/refresh", response_model=TokenResponse)
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    record = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(data.refresh_token))
    )
    now = datetime.now(timezone.utc)
    if record is None or record.revoked_at is not None or record.expires_at < now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")

    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")

    # Rotation: old token becomes invalid immediately
    record.revoked_at = now
    db.commit()

    org = db.get(Organization, user.organization_id) if user.organization_id else None
    return _issue_tokens(db, user, org.setup_completed if org else False)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(data: RefreshRequest, db: Session = Depends(get_db)):
    record = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(data.refresh_token))
    )
    if record is not None and record.revoked_at is None:
        record.revoked_at = datetime.now(timezone.utc)
        db.commit()


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id) if user.organization_id else None
    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        organization_id=user.organization_id,
        setup_completed=org.setup_completed if org else False,
    )