import sys
from pathlib import Path

# "app" પેકેજને Python પાથમાં ઉમેરો
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


import os
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.base import Base
from app.core.config import settings
from app.core.deps import get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import BusinessSettings, Organization, Shop, User

# ટેસ્ટિંગ ડેટાબેઝ એન્જિન (પોસ્ટગ્રેસ)
engine = create_engine(settings.database_url, pool_pre_ping=True)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    # સેશન પૂર્ણ થાય ત્યારે ક્લીનઅપ


@pytest.fixture
def db_session(setup_db):
    """દરેક ટેસ્ટ પછી રોલબેક કરે છે જેથી ડેટા પ્રદૂષિત ન થાય."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    """FastAPI TestClient વિથ DB Dependency Override."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_business_data(db_session):
    """ટેસ્ટ માટે ઓર્ગેનાઇઝેશન, શોપ, ઓનર યુઝર અને ઓથેન્ટિકેશન હેડર બનાવે છે."""
    org = Organization(
        name="Shreeji Agro Store",
        owner_name="Rameshbhai Patel",
        business_type="retail",
        business_category="agro_shop",
        mobile="9876543210",
        address="Station Road",
        city="Anand",
        state="Gujarat",
        pincode="388001",
        setup_completed=True,
    )
    db_session.add(org)
    db_session.flush()

    shop = Shop(
        organization_id=org.id,
        name=org.name,
        city=org.city,
        is_default=True,
    )
    db_session.add(shop)

    settings_record = BusinessSettings(
        organization_id=org.id,
        invoice_prefix="INV",
        invoice_number_padding=5,
        invoice_template="professional",
    )
    db_session.add(settings_record)

    user = User(
        organization_id=org.id,
        email="testowner@volonce.com",
        full_name="Rameshbhai Patel",
        mobile="9876543210",
        password_hash=hash_password("Owner@12345"),
        role="owner",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token(
        user_id=str(user.id),
        organization_id=str(org.id),
        role=user.role,
    )

    return {
        "org": org,
        "shop": shop,
        "user": user,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }