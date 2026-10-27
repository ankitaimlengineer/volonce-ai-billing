"""product_variants table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-05 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'product_variants' not in existing_tables:
        op.create_table(
            'product_variants',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('organization_id', sa.UUID(), nullable=False),
            sa.Column('product_id', sa.UUID(), nullable=False),
            sa.Column('variant_name', sa.String(length=100), nullable=False),
            sa.Column('sku', sa.String(length=64), nullable=True),
            sa.Column('barcode', sa.String(length=64), nullable=True),
            sa.Column('purchase_price', sa.Numeric(precision=14, scale=2), server_default='0.00', nullable=False),
            sa.Column('selling_price', sa.Numeric(precision=14, scale=2), server_default='0.00', nullable=False),
            sa.Column('mrp', sa.Numeric(precision=14, scale=2), nullable=True),
            sa.Column('attributes', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
            sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('organization_id', 'sku', name='uq_variant_org_sku')
        )
        op.create_index(op.f('ix_product_variants_organization_id'), 'product_variants', ['organization_id'], unique=False)
        op.create_index(op.f('ix_product_variants_product_id'), 'product_variants', ['product_id'], unique=False)
        op.create_index(op.f('ix_product_variants_barcode'), 'product_variants', ['barcode'], unique=False)
        op.create_index('ix_variants_org_product', 'product_variants', ['organization_id', 'product_id'], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'product_variants' in inspector.get_table_names():
        op.drop_table('product_variants')