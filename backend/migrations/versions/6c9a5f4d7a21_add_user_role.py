"""add user role

Revision ID: 6c9a5f4d7a21
Revises: b30a26e5d5a0
Create Date: 2026-06-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6c9a5f4d7a21"
down_revision: Union[str, Sequence[str], None] = "b30a26e5d5a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=32), nullable=False, server_default="manager"),
    )
    op.execute("UPDATE users SET role = 'leader' WHERE bitrix_user_id = 1")
    op.alter_column("users", "role", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "role")
