from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Organization, User
from app.schemas.auth import LoginRequest, MeResponse, RegisterRequest, TokenResponse

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Organization + owner user are created in ONE transaction
    org = Organization(name=data.business_name, owner_name=data.full_name)
    db.add(org)
    db.flush()  # gets org.id without committing

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

    token = create_access_token(str(user.id), str(org.id), user.role)
    return TokenResponse(access_token=token, setup_completed=org.setup_completed)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    # Same error for wrong email or wrong password (no user enumeration)
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")

    org = db.get(Organization, user.organization_id) if user.organization_id else None
    token = create_access_token(
        str(user.id), str(user.organization_id) if user.organization_id else None, user.role
    )
    return TokenResponse(
        access_token=token, setup_completed=org.setup_completed if org else False
    )


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