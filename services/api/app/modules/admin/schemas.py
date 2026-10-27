import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, EmailStr


class PlatformStats(BaseModel):
    total_organizations: int
    active_subscriptions: int
    trial_subscriptions: int
    expired_subscriptions: int
    total_revenue: Decimal
    total_invoices_created: int
    total_ai_scans: int
    total_whatsapp_messages: int


class AdminBusinessRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    owner_name: str | None = None
    email: str | None = None
    mobile: str | None = None
    city: str | None = None
    created_at: datetime
    setup_completed: bool
    plan_name: str
    plan_slug: str
    subscription_status: str
    expires_at: datetime | None = None
    days_left: int
    total_invoices: int


class AdminBusinessListResponse(BaseModel):
    stats: PlatformStats
    businesses: list[AdminBusinessRow]


class ManualSubscriptionExtend(BaseModel):
    plan_slug: str
    extend_days: int = 30
    note: str | None = None