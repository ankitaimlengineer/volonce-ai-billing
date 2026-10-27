import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_setup_completed
from app.models import (
    Customer,
    CustomerLedger,
    InventoryMovement,
    Notification,
    OrganizationSubscription,
    Product,
    SubscriptionPlan,
    User,
)
from app.modules.notifications.schemas import NotificationOut, NotificationSummary

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=NotificationSummary)
def get_notifications(
    user: User = Depends(require_setup_completed),
    db: Session = Depends(get_db),
):
    """દુકાનદાર માટે લાઈવ એલર્ટ્સ અને નોટિફિકેશન્સ લાવી આપે છે."""
    org_id = user.organization_id
    now = datetime.now(timezone.utc)
    today = date.today()

    # ૧. ઓટો-ચેક: સબસ્ક્રિપ્શન સમાપ્તિ એલર્ટ
    sub = db.scalar(
        select(OrganizationSubscription)
        .where(OrganizationSubscription.organization_id == org_id)
        .order_by(OrganizationSubscription.created_at.desc())
    )
    if sub:
        days_left = (sub.expires_at - now).days
        if days_left <= 2:
            existing = db.scalar(
                select(Notification).where(
                    Notification.organization_id == org_id,
                    Notification.category == "subscription",
                    Notification.created_at >= now - timedelta(hours=24),
                )
            )
            if not existing:
                db.add(
                    Notification(
                        organization_id=org_id,
                        title="⚠️ સબસ્ક્રિપ્શન સમાપ્ત થઈ રહ્યું છે!",
                        message=f"તમારો પ્લાન {max(0, days_left)} દિવસમાં એક્સપાયર થશે. અવિરત બિલિંગ માટે રીન્યુ કરો.",
                        category="subscription",
                        severity="critical" if days_left <= 0 else "warning",
                        link="/subscription",
                    )
                )

    # ૨. ઓટો-ચેક: સ્ટોક ખલાસ (Out of Stock) એલર્ટ્સ
    stock_subq = (
        select(
            InventoryMovement.product_id.label("pid"),
            func.coalesce(func.sum(InventoryMovement.quantity), 0).label("qty"),
        )
        .where(InventoryMovement.organization_id == org_id)
        .group_by(InventoryMovement.product_id)
        .subquery()
    )

    out_prods = db.execute(
        select(Product.name)
        .outerjoin(stock_subq, stock_subq.c.pid == Product.id)
        .where(
            Product.organization_id == org_id,
            Product.is_active.is_(True),
            func.coalesce(stock_subq.c.qty, 0) <= 0,
        )
        .limit(5)
    ).all()

    for p in out_prods:
        p_name = p[0]
        existing = db.scalar(
            select(Notification).where(
                Notification.organization_id == org_id,
                Notification.category == "stock",
                Notification.title.ilike(f"%{p_name}%"),
                Notification.created_at >= now - timedelta(hours=24),
            )
        )
        if not existing:
            db.add(
                Notification(
                    organization_id=org_id,
                    title=f"📦 સ્ટોક ખલાસ: {p_name}",
                    message=f"'{p_name}' નો સ્ટોક 0 થઈ ગયો છે. નવો માલ મંગાવો.",
                    category="stock",
                    severity="warning",
                    link="/stock",
                )
            )

    db.commit()

    # તમામ નોટિફિકેશન લાવો
    items = db.scalars(
        select(Notification)
        .where(Notification.organization_id == org_id)
        .order_by(Notification.created_at.desc())
        .limit(30)
    ).all()

    unread = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.organization_id == org_id, Notification.is_read.is_(False)
        )
    ) or 0

    return NotificationSummary(
        unread_count=unread,
        items=[NotificationOut.model_validate(n, from_attributes=True) for n in items],
    )


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: uuid.UUID,
    user: User = Depends(require_setup_completed),
    db: Session = Depends(get_db),
):
    notif = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.organization_id == user.organization_id,
        )
    )
    if notif:
        notif.is_read = True
        db.commit()
    return {"success": True}


@router.post("/read-all")
def mark_all_read(
    user: User = Depends(require_setup_completed),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.organization_id == user.organization_id,
        Notification.is_read.is_(False),
    ).update({"is_read": True})
    db.commit()
    return {"success": True}