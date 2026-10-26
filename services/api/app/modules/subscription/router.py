import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, status
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.models import Organization, User
from app.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.subscription.schemas import (
    ExternalPurchaseRequest,
    ExternalPurchaseResponse,
    PaymentVerifyResponse,
    PlanOut,
    RazorpayOrderOut,
    RedeemCodeRequest,
    RedeemCodeResponse,
    SubscriptionStatusOut,
    VerifyPaymentRequest,
)

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
        existing = db.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == p_data["slug"])
        )
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
        trial_plan = db.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == "free_trial")
        )
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
    plans = db.scalars(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active.is_(True))
    ).all()
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


# ---------------- RAZORPAY INTEGRATION ENDPOINTS ----------------

@router.post("/create-order/{plan_slug}", response_model=RazorpayOrderOut)
async def create_razorpay_order(
    plan_slug: str,
    user: User = Depends(can_access),
    db: Session = Depends(get_db),
):
    """Creates a Razorpay Order for online subscription payment."""
    plan = db.scalar(
        select(SubscriptionPlan).where(
            SubscriptionPlan.slug == plan_slug, SubscriptionPlan.is_active.is_(True)
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    amount_in_paise = int(plan.price * 100)
    receipt_id = f"sub_{uuid.uuid4().hex[:10]}"
    order_id = f"order_{uuid.uuid4().hex[:14]}"

    # જો સાચી Razorpay Keys કન્ફિગર હોય તો Razorpay Cloud API થી ઓર્ડર બનશે
    if settings.razorpay_key_id and settings.razorpay_key_secret:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    "https://api.razorpay.com/v1/orders",
                    auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
                    json={
                        "amount": amount_in_paise,
                        "currency": "INR",
                        "receipt": receipt_id,
                        "notes": {
                            "organization_id": str(user.organization_id),
                            "plan_slug": plan.slug,
                        },
                    },
                )
                if res.status_code in (200, 201):
                    order_id = res.json().get("id", order_id)
        except Exception as e:
            print("Razorpay API Connect Note:", e)

    return RazorpayOrderOut(
        order_id=order_id,
        amount=amount_in_paise,
        currency="INR",
        key_id=settings.razorpay_key_id or "rzp_test_51O8v1Lw0QXXXX",
        plan_slug=plan.slug,
        plan_name=plan.name,
    )


@router.post("/verify-payment", response_model=PaymentVerifyResponse)
def verify_payment_and_activate(
    data: VerifyPaymentRequest,
    user: User = Depends(can_access),
    db: Session = Depends(get_db),
):
    """Verifies Razorpay Signature and activates the subscription plan."""
    plan = db.scalar(
        select(SubscriptionPlan).where(
            SubscriptionPlan.slug == data.plan_slug, SubscriptionPlan.is_active.is_(True)
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Signature verification
    if settings.razorpay_key_secret and data.razorpay_signature:
        generated_signature = hmac.new(
            settings.razorpay_key_secret.encode(),
            f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(generated_signature, data.razorpay_signature):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment signature verification failed",
            )

    current_sub = get_or_create_org_subscription(db, user.organization_id)
    now = datetime.now(timezone.utc)

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
        razorpay_order_id=data.razorpay_order_id,
        razorpay_payment_id=data.razorpay_payment_id,
    )
    db.add(new_sub)
    db.commit()

    return PaymentVerifyResponse(
        success=True,
        message=f"🎉 પેમેન્ટ સફળ થયું! {plan.name} સફળતાપૂર્વક સક્રિય થયો છે (મુદત: {new_expiry.strftime('%d-%m-%Y')} સુધી).",
    )


# ---------------- VOLONIS.IN વેબસાઇટ ઓટો-એક્ટિવેશન WEBHOOK ----------------

@router.post("/external-webhook", response_model=ExternalPurchaseResponse)
def handle_external_purchase(
    data: ExternalPurchaseRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """volonis.in પર થયેલી ખરીદી પરથી સીધું સબસ્ક્રિપ્શન આપોઆપ ચાલુ કરવા માટે."""
    # ૧. સિક્યોરિટી ચેક (માત્ર તમારી વેબસાઇટ જ આ API કોલ કરી શકે)
    secret_key = getattr(settings, "volonis_webhook_secret", "volonis_super_secure_secret_key_2026")
    auth_header = request.headers.get("X-Volonis-Secret")
    if not auth_header or auth_header != secret_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized call: Invalid X-Volonis-Secret",
        )

    # ૨. પ્લાન શોધો
    plan = db.scalar(
        select(SubscriptionPlan).where(
            SubscriptionPlan.slug == data.plan_slug, SubscriptionPlan.is_active.is_(True)
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan '{data.plan_slug}' not found")

    # ૩. ગ્રાહકના ઈમેલ પરથી તેનો યુઝર અને ઓર્ગેનાઇઝેશન શોધો
    user = db.scalar(select(User).where(User.email == data.email.lower().strip()))
    if not user or not user.organization_id:
        raise HTTPException(
            status_code=404,
            detail=f"{data.email} સાથે કોઈ રજીસ્ટર્ડ દુકાન મળી નથી. પહેલાં એપમાં રજીસ્ટર કરાવો.",
        )

    # ૪. સબસ્ક્રિપ્શન લંબાવો અથવા નવું શરૂ કરો
    current_sub = get_or_create_org_subscription(db, user.organization_id)
    now = datetime.now(timezone.utc)

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
        amount_paid=data.amount_paid,
        razorpay_order_id=data.order_id,
        razorpay_payment_id=f"volonis_{data.order_id}",
    )
    db.add(new_sub)
    db.commit()

    return ExternalPurchaseResponse(
        success=True,
        message=f"✓ {user.full_name} ({data.email}) માટે {plan.name} સફળતાપૂર્વક ચાલુ થઈ ગયો છે!",
        expires_at=new_expiry,
    )


# ---------------- લાઈસન્સ / કૂપન કોડ રિડીમ કરવાનો એન્ડપોઇન્ટ ----------------

@router.post("/redeem-code", response_model=RedeemCodeResponse)
def redeem_voucher_code(
    data: RedeemCodeRequest,
    user: User = Depends(can_access),
    db: Session = Depends(get_db),
):
    """ગ્રાહક પોતાની એપમાં વાઉચર કે લાઈસન્સ કોડ નાખીને પ્લાન અનલોક કરી શકે."""
    code_clean = data.code.strip().upper()

    # લાઈસન્સ કોડ પ્રમાણે પ્લાન મેપિંગ
    slug_mapping = {
        "VOLONIS-30": "monthly",
        "VOLONIS-90": "quarterly",
        "VOLONIS-180": "half_yearly",
        "VOLONIS-365": "yearly",
        "YEARLY2026": "yearly",
    }

    matched_slug = slug_mapping.get(code_clean)
    if not matched_slug:
        raise HTTPException(status_code=400, detail="અમાન્ય અથવા એક્સપાયર થયેલ કૂપન કોડ")

    plan = db.scalar(
        select(SubscriptionPlan).where(
            SubscriptionPlan.slug == matched_slug, SubscriptionPlan.is_active.is_(True)
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    current_sub = get_or_create_org_subscription(db, user.organization_id)
    now = datetime.now(timezone.utc)

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
        amount_paid=Decimal("0.0"),
        razorpay_order_id=f"code_{code_clean}",
        razorpay_payment_id=f"redeem_{uuid.uuid4().hex[:10]}",
    )
    db.add(new_sub)
    db.commit()

    return RedeemCodeResponse(
        success=True,
        message=f"🎉 કોડ સફળતાપૂર્વક રિડીમ થયો! {plan.name} સક્રિય થઈ ગયો છે.",
        plan_name=plan.name,
        expires_at=new_expiry,
    )


# ડાયરેક્ટ એક્ટિવેશન બેકઅપ માટે
@router.post("/activate-plan/{plan_slug}")
def activate_plan(
    plan_slug: str,
    user: User = Depends(can_access),
    db: Session = Depends(get_db),
):
    """Direct Plan Activation Fallback."""
    plan = db.scalar(
        select(SubscriptionPlan).where(
            SubscriptionPlan.slug == plan_slug, SubscriptionPlan.is_active.is_(True)
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    current_sub = get_or_create_org_subscription(db, user.organization_id)
    now = datetime.now(timezone.utc)

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