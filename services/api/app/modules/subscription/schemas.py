import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel

class PlanOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    price: Decimal
    duration_days: int
    description: str | None = None
    is_active: bool

class SubscriptionStatusOut(BaseModel):
    is_active: bool
    is_trial: bool
    plan_name: str
    plan_slug: str
    starts_at: datetime
    expires_at: datetime
    days_left: int
    status: str