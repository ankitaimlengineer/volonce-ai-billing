import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import (
    AiDetection,
    Invoice,
    Organization,
    OrganizationSubscription,
    SubscriptionPlan,
    User,
    WhatsAppMessage,
)
from app.modules.admin.schemas import (
    AdminBusinessListResponse,
    AdminBusinessRow,
    ManualSubscriptionExtend,
    PlatformStats,
)
from app.modules.subscription.router import (
    ensure_default_plans,
    get_or_create_org_subscription,
)

router = APIRouter(prefix="/api/v1/admin", tags=["super-admin"])


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="આ એક્સેસ ફક્ત પ્લેટફોર્મ સુપર એડમિન માટે જ માન્ય છે.",
        )
    return user


@router.get("/overview", response_model=AdminBusinessListResponse)
def get_admin_overview(
    _admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    ensure_default_plans(db)
    now = datetime.now(timezone.utc)

    # ૧. ગ્લોબલ પ્લેટફોર્મ સ્ટેટ્સ ગણો
    total_orgs = db.scalar(select(func.count(Organization.id))) or 0
    total_invs = db.scalar(select(func.count(Invoice.id))) or 0
    total_scans = db.scalar(select(func.count(AiDetection.id))) or 0
    total_wa = db.scalar(select(func.count(WhatsAppMessage.id))) or 0

    total_rev = db.scalar(
        select(func.coalesce(func.sum(OrganizationSubscription.amount_paid), 0))
    ) or Decimal("0.0")

    # ૨. તમામ દુકાનો લાવો
    orgs = db.scalars(select(Organization).order_by(Organization.created_at.desc())).all()

    # ઇન્વોઇસ કાઉન્ટ મેપ
    inv_counts = dict(
        db.execute(
            select(Invoice.organization_id, func.count(Invoice.id)).group_by(Invoice.organization_id)
        ).all()
    )

    businesses_out: list[AdminBusinessRow] = []
    active_count = 0
    trial_count = 0
    expired_count = 0

    for org in orgs:
        sub = get_or_create_org_subscription(db, org.id)
        plan = db.get(SubscriptionPlan, sub.plan_id)
        days_left = max(0, (sub.expires_at - now).days)
        is_active = sub.status == "active" and sub.expires_at > now

        if is_active:
            if plan.slug == "free_trial":
                trial_count += 1
            else:
                active_count += 1
        else:
            expired_count += 1

        businesses_out.append(
            AdminBusinessRow(
                id=org.id,
                name=org.name,
                owner_name=org.owner_name,
                email=org.email,
                mobile=org.mobile,
                city=org.city,
                created_at=org.created_at,
                setup_completed=org.setup_completed,
                plan_name=plan.name,
                plan_slug=plan.slug,
                subscription_status=sub.status if is_active else "expired",
                expires_at=sub.expires_at,
                days_left=days_left,
                total_invoices=inv_counts.get(org.id, 0),
            )
        )

    stats = PlatformStats(
        total_organizations=total_orgs,
        active_subscriptions=active_count,
        trial_subscriptions=trial_count,
        expired_subscriptions=expired_count,
        total_revenue=Decimal(str(total_rev)),
        total_invoices_created=total_invs,
        total_ai_scans=total_scans,
        total_whatsapp_messages=total_wa,
    )

    return AdminBusinessListResponse(stats=stats, businesses=businesses_out)


@router.post("/businesses/{org_id}/extend-subscription")
def admin_extend_subscription(
    org_id: uuid.UUID,
    payload: ManualSubscriptionExtend,
    _admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """સુપર એડમિન કોઈપણ દુકાનદાર માટે સીધા દિવસો લંબાવી શકે છે."""
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="દુકાન મળી નથી.")

    plan = db.scalar(
        select(SubscriptionPlan).where(
            SubscriptionPlan.slug == payload.plan_slug, SubscriptionPlan.is_active.is_(True)
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail="પ્લાન મળ્યો નથી.")

    current_sub = get_or_create_org_subscription(db, org.id)
    now = datetime.now(timezone.utc)

    if current_sub.status == "active" and current_sub.expires_at > now:
        new_expiry = current_sub.expires_at + timedelta(days=payload.extend_days)
    else:
        new_expiry = now + timedelta(days=payload.extend_days)

    new_sub = OrganizationSubscription(
        organization_id=org.id,
        plan_id=plan.id,
        status="active",
        starts_at=now,
        expires_at=new_expiry,
        amount_paid=Decimal("0.0"),  # એડમિન દ્વારા ફ્રી/મેન્યુઅલ એક્સટેન્શન
        razorpay_order_id=f"admin_{_admin.id}",
        razorpay_payment_id=f"admin_granted_{datetime.now().strftime('%Y%m%d%H%M')}",
    )
    db.add(new_sub)
    db.commit()

    return {
        "success": True,
        "message": f"✓ {org.name} માટે {plan.name} સફળતાપૂર્વક {payload.extend_days} દિવસ લંબાવવામાં આવ્યો છે!",
        "new_expires_at": new_expiry,
    }