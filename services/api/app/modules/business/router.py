import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import BusinessSettings, Organization, Shop, User
from app.schemas.business import (
    BusinessResponse,
    ProfileResponse,
    ProfileUpdate,
    SettingsResponse,
    SettingsUpdate,
    ShopCreate,
    ShopOut,
)

router = APIRouter(prefix="/api/v1/business", tags=["business"])

# Setup APIs must work BEFORE setup is completed, so no setup guard here.
owner_or_manager = require_roles("owner", "manager")
can_read = require_setup_completed


def _org_id(user: User) -> uuid.UUID:
    if user.organization_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No business linked to this user")
    return user.organization_id


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


# =========================================================================
# ૧. BUSINESS PROFILE & SETTINGS
# =========================================================================

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


# =========================================================================
# ૨. 🏪 MULTI-SHOP & GODOWN MANAGEMENT (મલ્ટી-શાખા અને ગોડાઉન)
# =========================================================================

@router.get("/shops", response_model=list[ShopOut])
def list_shops(user: User = Depends(can_read), db: Session = Depends(get_db)):
    """તમામ સક્રિય શાખાઓ અને ગોડાઉનની યાદી લાવો."""
    org_id = _org_id(user)
    return db.scalars(
        select(Shop)
        .where(Shop.organization_id == org_id)
        .order_by(Shop.is_default.desc(), Shop.name)
    ).all()


@router.post("/shops", response_model=ShopOut, status_code=status.HTTP_201_CREATED)
def create_shop(
    data: ShopCreate,
    user: User = Depends(owner_or_manager),
    db: Session = Depends(get_db),
):
    """નવી શાખા, બીજી દુકાન કે ગોડાઉન ઉમેરો."""
    org = _get_org(db, user)

    # જો આને ડિફોલ્ટ બનાવવાની હોય તો જૂની ડિફોલ્ટ શાખા અન-ચેક કરો
    if data.is_default:
        db.query(Shop).filter(Shop.organization_id == org.id).update({"is_default": False})

    shop = Shop(
        organization_id=org.id,
        name=data.name.strip(),
        address=data.address.strip() if data.address else None,
        city=data.city.strip() if data.city else None,
        state=data.state.strip() if data.state else None,
        pincode=data.pincode.strip() if data.pincode else None,
        is_default=data.is_default,
    )
    db.add(shop)
    db.commit()
    db.refresh(shop)
    return shop


@router.post("/shops/{shop_id}/set-default", response_model=ShopOut)
def set_default_shop(
    shop_id: uuid.UUID,
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    """૧-ક્લિકમાં સક્રિય શાખા / ગોડાઉન સ્વિચ કરો."""
    org = _get_org(db, user)
    target = db.scalar(
        select(Shop).where(Shop.id == shop_id, Shop.organization_id == org.id)
    )
    if not target:
        raise HTTPException(status_code=404, detail="શાખા કે ગોડાઉન મળ્યું નથી.")

    # અન્ય તમામ શાખાઓમાંથી is_default હટાવો અને પસંદ કરેલી શાખાને ડિફોલ્ટ બનાવો
    db.query(Shop).filter(Shop.organization_id == org.id).update({"is_default": False})
    target.is_default = True
    db.commit()
    db.refresh(target)
    return target


@router.delete("/shops/{shop_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shop(
    shop_id: uuid.UUID,
    user: User = Depends(owner_or_manager),
    db: Session = Depends(get_db),
):
    """બંધ થયેલી શાખા કાઢી નાખો (ડિફોલ્ટ મુખ્ય શાખા ડિલીટ નહીં થાય)."""
    org = _get_org(db, user)
    target = db.scalar(
        select(Shop).where(Shop.id == shop_id, Shop.organization_id == org.id)
    )
    if not target:
        raise HTTPException(status_code=404, detail="શાખા મળી નથી.")
    if target.is_default:
        raise HTTPException(status_code=400, detail="મુખ્ય સક્રિય શાખા ડિલીટ કરી શકાય નહીં.")

    db.delete(target)
    db.commit()