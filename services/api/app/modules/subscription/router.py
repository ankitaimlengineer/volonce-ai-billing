import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models import Organization, User
from app.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.subscription.schemas import PlanOut, SubscriptionStatusOut

router = APIRouter(prefix="/api/v1/subscription", tags=["subscription"])
can_access = require_roles("owner", "manager")

# Default 5-tier pricing catalog
DEFAULT_PLANS = [
    {
        "name": "🆓 Free Trial",
        "slug": "free_trial",
        "price": Decimal("0.0"),
        "duration_days": 5,
        "description": "૫ દિવસ માટે તમામ સુવિધાઓ મફત!",
    },
    {
        "name": "🟢 Monthly Plan",
        "slug": "monthly",
        "price": Decimal("299.0"),
        "duration_days": 30,
        "description": "દર મહિને ચૂકવણી કરવા માગતા વેપારીઓ માટે",
    },
    {
        "name": "🔵 Quarterly Plan",
        "slug": "quarterly",
        "price": Decimal("799.0"),
        "duration_days": 90,
        "description": "૩ મહિનાનું સબસ્ક્રિપ્શન (૧૨% બચત)",
    },
    {
        "name": "🟣 Half-Yearly Plan",
        "slug": "half_yearly",
        "price": Decimal("1499.0"),
        "duration_days": 180,
        "description": "૬ મહિનાનું સબસ્ક્રિપ્શન (૧૬% બચત)",
    },
    {
        "name": "🟡 Yearly Plan (Best Value)",
        "slug": "yearly",
        "price": Decimal("2499.0"),
        "duration_days": 365,
        "description": "આખું ૧ વર્ષ - સૌથી વધુ ૩૦% બચત!",
    },
]

def ensure_default_plans(db: Session):
    """Auto-seeds the 5 pricing tiers if not in database."""
    for p_data in DEFAULT_PLANS:
        existing = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.slug == p_data["slug"]))
        if not existing:
            db.add(SubscriptionPlan(**p_data, is_active=True))
    db.commit()

def get_or_create_org_subscription(db: Session, org_id: uuid.UUID) -> OrganizationSubscription:
    """Gets subscription, or grants 5-day Free Trial if new organization."""
    ensure_default_plans(db)
    sub = db.scalar(
        select(OrganizationSubscription)
        .where(OrganizationSubscription.organization_id == org_id)
        .order_by(OrganizationSubscription.created_at.desc())
    )

    now = datetime.now(timezone.utc)

    # If organization has never had any subscription -> Grant 5-Day Free Trial!
    if not sub:
        trial_plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.slug == "free_trial"))
        sub = OrganizationSubscription(
            organization_id=org_id,
            plan_id=trial_plan.id,
            status="active",
            starts_at=now,
            expires_at=now + timedelta(days=5),
            amount_paid=Decimal("0.0"),
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)

    # Check expiry status
    if sub.expires_at < now and sub.status == "active":
        sub.status = "expired"
        db.commit()

    return sub

@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)):
    """Returns all available subscription plans."""
    ensure_default_plans(db)
    plans = db.scalars(select(SubscriptionPlan).where(SubscriptionPlan.is_active.is_(True))).all()
    # Sort by duration
    return sorted(plans, key=lambda x: x.duration_days)

@router.get("/status", response_model=SubscriptionStatusOut)
def get_subscription_status(
    user: User = Depends(can_access),
    db: Session = Depends(get_db),
):
    """Returns the current shop's subscription status and remaining days."""
    sub = get_or_create_org_subscription(db, user.organization_id)
    plan = db.get(SubscriptionPlan, sub.plan_id)
    now = datetime.now(timezone.utc)

    days_left = max(0, (sub.expires_at - now).days)
    is_active = sub.status == "active" and sub.expires_at > now

    return SubscriptionStatusOut(
        is_active=is_active,
        is_trial=(plan.slug == "free_trial"),
        plan_name=plan.name,
        plan_slug=plan.slug,
        starts_at=sub.starts_at,
        expires_at=sub.expires_at,
        days_left=days_left,
        status=sub.status,
    )

@router.post("/activate-plan/{plan_slug}")
def activate_plan(
    plan_slug: str,
    user: User = Depends(can_access),
    db: Session = Depends(get_db),
):
    """Activates/Renews a subscription plan for the organization."""
    plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.slug == plan_slug, SubscriptionPlan.is_active.is_(True)))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    current_sub = get_or_create_org_subscription(db, user.organization_id)
    now = datetime.now(timezone.utc)

    # If current subscription is still active, add days onto current expiry date!
    if current_sub.status == "active" and current_sub.expires_at > now:
        new_expiry = current_sub.expires_at + timedelta(days=plan.duration_days)
    else:
        new_expiry = now + timedelta(days=plan.duration_days)

    new_sub = OrganizationSubscription(
        organization_id=user.organization_id,
        plan_id=plan.id,
        status="active",
        starts_at=now,
        expires_at=new_expiry,
        amount_paid=plan.price,
    )
    db.add(new_sub)
    db.commit()

    return {
        "success": True,
        "message": f"✓ {plan.name} સફળતાપૂર્વક સક્રિય થયો છે! નવી મુદત: {new_expiry.strftime('%d-%m-%Y')} સુધી.",
    }