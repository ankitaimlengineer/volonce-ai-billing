"""add bounding_box to draft items

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e7
Create Date: 2026-11-01 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f1a2b3c4d5e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # ખાતરી કરો કે bill_draft_items ટેબલ હાજર છે અને bounding_box કોલમ પહેલેથી નથી
    if 'bill_draft_items' in existing_tables:
        cols = [c['name'] for c in inspector.get_columns('bill_draft_items')]
        if 'bounding_box' not in cols:
            op.add_column(
                'bill_draft_items',
                sa.Column('bounding_box', postgresql.JSONB(astext_type=sa.Text()), nullable=True)
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'bill_draft_items' in existing_tables:
        cols = [c['name'] for c in inspector.get_columns('bill_draft_items')]
        if 'bounding_box' in cols:
            op.drop_column('bill_draft_items', 'bounding_box')