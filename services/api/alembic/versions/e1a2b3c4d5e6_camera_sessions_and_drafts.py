"""camera sessions and drafts

Revision ID: e1a2b3c4d5e6
Revises: c8f1e2d3a4b5
Create Date: 2026-10-26 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e1a2b3c4d5e6'
down_revision: Union[str, None] = 'c8f1e2d3a4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. camera_sessions
    op.create_table(
        'camera_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('shop_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('customer_id', sa.UUID(), nullable=True),
        sa.Column('mode', sa.String(length=20), server_default='single', nullable=False),
        sa.Column('status', sa.String(length=20), server_default='active', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_camera_sessions_organization_id'), 'camera_sessions', ['organization_id'], unique=False)

    # 2. camera_images
    op.create_table(
        'camera_images',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.UUID(), nullable=False),
        sa.Column('storage_key', sa.String(length=300), nullable=False),
        sa.Column('content_type', sa.String(length=50), server_default='image/jpeg', nullable=False),
        sa.Column('image_hash', sa.String(length=64), nullable=True),
        sa.Column('is_duplicate', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['camera_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_camera_images_session_id'), 'camera_images', ['session_id'], unique=False)
    op.create_index(op.f('ix_camera_images_image_hash'), 'camera_images', ['image_hash'], unique=False)

    # 3. ai_detections
    op.create_table(
        'ai_detections',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('image_id', sa.UUID(), nullable=False),
        sa.Column('raw_name', sa.String(length=255), nullable=False),
        sa.Column('matched_product_id', sa.UUID(), nullable=True),
        sa.Column('detected_quantity', sa.Numeric(precision=10, scale=2), server_default='1.0', nullable=False),
        sa.Column('confidence', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('uncertainty_level', sa.String(length=20), server_default='low', nullable=False),
        sa.Column('bounding_box', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['image_id'], ['camera_images.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['matched_product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_detections_image_id'), 'ai_detections', ['image_id'], unique=False)

    # 4. bill_drafts
    op.create_table(
        'bill_drafts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.UUID(), nullable=True),
        sa.Column('customer_id', sa.UUID(), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='draft', nullable=False),
        sa.Column('subtotal', sa.Numeric(precision=14, scale=2), server_default='0.0', nullable=False),
        sa.Column('tax_total', sa.Numeric(precision=14, scale=2), server_default='0.0', nullable=False),
        sa.Column('grand_total', sa.Numeric(precision=14, scale=2), server_default='0.0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['session_id'], ['camera_sessions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_bill_drafts_organization_id'), 'bill_drafts', ['organization_id'], unique=False)

    # 5. bill_draft_items
    op.create_table(
        'bill_draft_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('draft_id', sa.UUID(), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=14, scale=3), server_default='1.0', nullable=False),
        sa.Column('rate', sa.Numeric(precision=14, scale=2), server_default='0.0', nullable=False),
        sa.Column('tax_percent', sa.Numeric(precision=5, scale=2), server_default='0.0', nullable=False),
        sa.Column('tax_amount', sa.Numeric(precision=14, scale=2), server_default='0.0', nullable=False),
        sa.Column('total', sa.Numeric(precision=14, scale=2), server_default='0.0', nullable=False),
        sa.Column('confidence', sa.Float(), server_default='100.0', nullable=False),
        sa.ForeignKeyConstraint(['draft_id'], ['bill_drafts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_bill_draft_items_draft_id'), 'bill_draft_items', ['draft_id'], unique=False)


def downgrade() -> None:
    op.drop_table('bill_draft_items')
    op.drop_table('bill_drafts')
    op.drop_table('ai_detections')
    op.drop_table('camera_images')
    op.drop_table('camera_sessions')