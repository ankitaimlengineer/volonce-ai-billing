"""stock_transfers and inventory_movement constraints

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-06 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # ૧. stock_transfers ટેબલ બનાવો
    if 'stock_transfers' not in existing_tables:
        op.create_table(
            'stock_transfers',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('organization_id', sa.UUID(), nullable=False),
            sa.Column('from_shop_id', sa.UUID(), nullable=False),
            sa.Column('to_shop_id', sa.UUID(), nullable=False),
            sa.Column('created_by', sa.UUID(), nullable=True),
            sa.Column('transfer_number', sa.String(length=50), nullable=False),
            sa.Column('idempotency_key', sa.String(length=100), nullable=False),
            sa.Column('transfer_date', sa.Date(), nullable=False),
            sa.Column('status', sa.String(length=20), server_default='completed', nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.CheckConstraint("from_shop_id <> to_shop_id", name="ck_transfer_different_shops"),
            sa.CheckConstraint("status IN ('completed', 'cancelled')", name="ck_transfer_status"),
            sa.ForeignKeyConstraint(['created_by'], ['users.id']),
            sa.ForeignKeyConstraint(['from_shop_id'], ['shops.id']),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
            sa.ForeignKeyConstraint(['to_shop_id'], ['shops.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('organization_id', 'idempotency_key', name='uq_transfer_idempotency'),
            sa.UniqueConstraint('organization_id', 'transfer_number', name='uq_transfer_number')
        )
        op.create_index(op.f('ix_stock_transfers_organization_id'), 'stock_transfers', ['organization_id'], unique=False)
        op.create_index(op.f('ix_stock_transfers_from_shop_id'), 'stock_transfers', ['from_shop_id'], unique=False)
        op.create_index(op.f('ix_stock_transfers_to_shop_id'), 'stock_transfers', ['to_shop_id'], unique=False)
        op.create_index('ix_transfers_org_date', 'stock_transfers', ['organization_id', 'transfer_date'], unique=False)

    # ૨. stock_transfer_items ટેબલ બનાવો
    if 'stock_transfer_items' not in existing_tables:
        op.create_table(
            'stock_transfer_items',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('organization_id', sa.UUID(), nullable=False),
            sa.Column('transfer_id', sa.UUID(), nullable=False),
            sa.Column('product_id', sa.UUID(), nullable=False),
            sa.Column('quantity', sa.Numeric(precision=14, scale=3), nullable=False),
            sa.Column('batch_no', sa.String(length=50), nullable=True),
            sa.Column('expiry_date', sa.Date(), nullable=True),
            sa.CheckConstraint("quantity > 0", name="ck_transfer_item_qty_positive"),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
            sa.ForeignKeyConstraint(['product_id'], ['products.id']),
            sa.ForeignKeyConstraint(['transfer_id'], ['stock_transfers.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_stock_transfer_items_organization_id'), 'stock_transfer_items', ['organization_id'], unique=False)
        op.create_index(op.f('ix_stock_transfer_items_transfer_id'), 'stock_transfer_items', ['transfer_id'], unique=False)
        op.create_index(op.f('ix_stock_transfer_items_product_id'), 'stock_transfer_items', ['product_id'], unique=False)

    # ૩. inventory_movements ટેબલના constraints અપડેટ કરો
    op.drop_constraint('ck_movement_type', 'inventory_movements', type_='check')
    op.drop_constraint('ck_movement_direction', 'inventory_movements', type_='check')

    op.create_check_constraint(
        'ck_movement_type',
        'inventory_movements',
        "movement_type IN ('opening','purchase','sales_return','sale','purchase_return','damage','expired','adjustment','transfer_in','transfer_out')"
    )
    op.create_check_constraint(
        'ck_movement_direction',
        'inventory_movements',
        "(movement_type IN ('opening','purchase','sales_return','transfer_in') AND quantity > 0) OR "
        "(movement_type IN ('sale','purchase_return','damage','expired','transfer_out') AND quantity < 0) OR "
        "(movement_type = 'adjustment')"
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'stock_transfer_items' in existing_tables:
        op.drop_table('stock_transfer_items')
    if 'stock_transfers' in existing_tables:
        op.drop_table('stock_transfers')