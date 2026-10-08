
from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base, TimestampMixin, UUIDMixin


class Organization(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_name: Mapped[str | None] = mapped_column(String(200))
    business_type: Mapped[str | None] = mapped_column(String(50))
    business_category: Mapped[str | None] = mapped_column(String(50))
    setup_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
