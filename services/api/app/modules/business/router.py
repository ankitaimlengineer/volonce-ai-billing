from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models import BusinessSettings, Organization, Shop, User
from app.schemas.business import (
    BusinessResponse,
    ProfileResponse,
    ProfileUpdate,
    SettingsResponse,
    SettingsUpdate,
)

router = APIRouter(prefix="/api/v1/business", tags=["business"])

# Setup APIs must work BEFORE setup is completed, so no setup guard here.
owner_or_manager = require_roles("owner", "manager")


def _get_org(db: Session, user: User) -> Organization:
    org = db.get(Organization, user.organization_id) if user.organization_id else None
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Business not found")
    return org


def _get_settings(db: Session, org: Organization) -> BusinessSettings:
    s = db.scalar(select(BusinessSettings).where(BusinessSettings.organization_id == org.id))
    if s is None:
        s = BusinessSettings(
            organization_id=org.id,
            invoice_template="professional",
            invoice_prefix="INV",
            invoice_number_padding=5,
        )
        db.add(s)
        db.flush()
    return s


def _build_response(org: Organization, s: BusinessSettings) -> BusinessResponse:
    return BusinessResponse(
        profile=ProfileResponse(
            name=org.name,
            owner_name=org.owner_name,
            business_type=org.business_type,
            business_category=org.business_category,
            mobile=org.mobile,
            email=org.email,
            address=org.address,
            city=org.city,
            state=org.state,
            pincode=org.pincode,
            gst_number=org.gst_number,
            setup_completed=org.setup_completed,
        ),
        settings=SettingsResponse.model_validate(s, from_attributes=True),
    )


@router.get("/profile", response_model=BusinessResponse)
def get_profile(user: User = Depends(owner_or_manager), db: Session = Depends(get_db)):
    org = _get_org(db, user)
    s = _get_settings(db, org)
    db.commit()
    return _build_response(org, s)


@router.put("/profile", response_model=BusinessResponse)
def update_profile(
    data: ProfileUpdate,
    user: User = Depends(owner_or_manager),
    db: Session = Depends(get_db),
):
    org = _get_org(db, user)
    for field, value in data.model_dump().items():
        setattr(org, field, value)

    # Keep the default shop in sync with the business address
    shop = db.scalar(
        select(Shop).where(Shop.organization_id == org.id, Shop.is_default.is_(True))
    )
    if shop:
        shop.name = org.name
        shop.address, shop.city = org.address, org.city
        shop.state, shop.pincode = org.state, org.pincode

    s = _get_settings(db, org)
    db.commit()
    return _build_response(org, s)


@router.put("/settings", response_model=BusinessResponse)
def update_settings(
    data: SettingsUpdate,
    user: User = Depends(owner_or_manager),
    db: Session = Depends(get_db),
):
    org = _get_org(db, user)
    s = _get_settings(db, org)
    for field, value in data.model_dump().items():
        setattr(s, field, value)
    db.commit()
    return _build_response(org, s)


@router.post("/complete-setup", response_model=BusinessResponse)
def complete_setup(user: User = Depends(owner_or_manager), db: Session = Depends(get_db)):
    org = _get_org(db, user)
    missing = [
        label
        for label, value in [
            ("business name", org.name),
            ("business type", org.business_type),
            ("business category", org.business_category),
            ("mobile", org.mobile),
            ("address", org.address),
            ("city", org.city),
            ("state", org.state),
            ("pincode", org.pincode),
        ]
        if not value
    ]
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Please fill: " + ", ".join(missing),
        )
    org.setup_completed = True
    s = _get_settings(db, org)
    db.commit()
    return _build_response(org, s)