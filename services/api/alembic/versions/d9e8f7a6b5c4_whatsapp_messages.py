"""whatsapp messages tracking table

Revision ID: d9e8f7a6b5c4
Revises: e1a2b3c4d5e6
Create Date: 2026-10-28 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd9e8f7a6b5c4'
down_revision: Union[str, None] = 'e1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'whatsapp_messages' not in existing_tables:
        op.create_table(
            'whatsapp_messages',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('organization_id', sa.UUID(), nullable=False),
            sa.Column('invoice_id', sa.UUID(), nullable=True),
            sa.Column('recipient_phone', sa.String(length=20), nullable=False),
            sa.Column('message_type', sa.String(length=30), server_default='invoice_pdf', nullable=False),
            sa.Column('whatsapp_message_id', sa.String(length=128), nullable=True),
            sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
            sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('whatsapp_message_id')
        )
        op.create_index(op.f('ix_whatsapp_messages_organization_id'), 'whatsapp_messages', ['organization_id'], unique=False)
        op.create_index(op.f('ix_whatsapp_messages_invoice_id'), 'whatsapp_messages', ['invoice_id'], unique=False)
        op.create_index(op.f('ix_whatsapp_messages_status'), 'whatsapp_messages', ['status'], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'whatsapp_messages' in inspector.get_table_names():
        op.drop_table('whatsapp_messages')