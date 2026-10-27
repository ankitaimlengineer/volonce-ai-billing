"""audit_logs_and_notifications

Revision ID: f1a2b3c4d5e7
Revises: d9e8f7a6b5c4
Create Date: 2026-10-30 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f1a2b3c4d5e7'
down_revision: Union[str, None] = 'd9e8f7a6b5c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # 1. audit_logs table
    if 'audit_logs' not in existing_tables:
        op.create_table(
            'audit_logs',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('organization_id', sa.UUID(), nullable=True),
            sa.Column('user_id', sa.UUID(), nullable=True),
            sa.Column('action', sa.String(length=50), nullable=False),
            sa.Column('resource_type', sa.String(length=50), nullable=False),
            sa.Column('resource_id', sa.String(length=100), nullable=True),
            sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('ip_address', sa.String(length=45), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_audit_logs_organization_id'), 'audit_logs', ['organization_id'], unique=False)
        op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
        op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)

    # 2. notifications table
    if 'notifications' not in existing_tables:
        op.create_table(
            'notifications',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('organization_id', sa.UUID(), nullable=False),
            sa.Column('title', sa.String(length=150), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('category', sa.String(length=30), server_default='info', nullable=False),
            sa.Column('severity', sa.String(length=20), server_default='info', nullable=False),
            sa.Column('is_read', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('link', sa.String(length=200), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_notifications_organization_id'), 'notifications', ['organization_id'], unique=False)
        op.create_index(op.f('ix_notifications_is_read'), 'notifications', ['is_read'], unique=False)
        op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'notifications' in existing_tables:
        op.drop_table('notifications')
    if 'audit_logs' in existing_tables:
        op.drop_table('audit_logs')