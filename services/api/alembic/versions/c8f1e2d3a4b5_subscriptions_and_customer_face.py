"""subscriptions and customer face

Revision ID: c8f1e2d3a4b5
Revises: 9b4f59d45997
Create Date: 2026-10-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c8f1e2d3a4b5'
down_revision: Union[str, None] = '9b4f59d45997'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    customer_columns = [col['name'] for col in inspector.get_columns('customers')]
    existing_tables = inspector.get_table_names()

    # 1. Add photo columns only if they do not exist
    if 'photo_key' not in customer_columns:
        op.add_column('customers', sa.Column('photo_key', sa.String(length=300), nullable=True))
    if 'photo_content_type' not in customer_columns:
        op.add_column('customers', sa.Column('photo_content_type', sa.String(length=50), nullable=True))

    # 2. Create subscription_plans table if not exists
    if 'subscription_plans' not in existing_tables:
        op.create_table(
            'subscription_plans',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('slug', sa.String(length=50), nullable=False),
            sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('duration_days', sa.Integer(), nullable=False),
            sa.Column('max_bills_per_month', sa.Integer(), nullable=False),
            sa.Column('ai_scanning_enabled', sa.Boolean(), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug')
        )

    # 3. Create organization_subscriptions table if not exists
    if 'organization_subscriptions' not in existing_tables:
        op.create_table(
            'organization_subscriptions',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('organization_id', sa.UUID(), nullable=False),
            sa.Column('plan_id', sa.UUID(), nullable=False),
            sa.Column('status', sa.String(length=30), nullable=False),
            sa.Column('starts_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('razorpay_order_id', sa.String(length=100), nullable=True),
            sa.Column('razorpay_payment_id', sa.String(length=100), nullable=True),
            sa.Column('amount_paid', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
            sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_organization_subscriptions_organization_id'), 'organization_subscriptions', ['organization_id'], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    customer_columns = [col['name'] for col in inspector.get_columns('customers')]

    if 'organization_subscriptions' in existing_tables:
        op.drop_index(op.f('ix_organization_subscriptions_organization_id'), table_name='organization_subscriptions')
        op.drop_table('organization_subscriptions')
    if 'subscription_plans' in existing_tables:
        op.drop_table('subscription_plans')
    if 'photo_content_type' in customer_columns:
        op.drop_column('customers', 'photo_content_type')
    if 'photo_key' in customer_columns:
        op.drop_column('customers', 'photo_key')