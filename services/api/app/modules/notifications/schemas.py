import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    message: str
    category: str
    severity: str
    is_read: bool
    link: str | None = None
    created_at: datetime


class NotificationSummary(BaseModel):
    unread_count: int
    items: list[NotificationOut]