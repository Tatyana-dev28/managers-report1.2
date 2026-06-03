from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Portal, User
from app.domain.roles import MANAGER
from app.services.report_settings_service import get_selected_assignee_bitrix_user_ids


def get_report_assignee_users(db: Session, portal: Portal) -> list[User]:
    selected_ids = get_selected_assignee_bitrix_user_ids(db, portal.id)
    if not selected_ids:
        return []

    query = select(User).where(
        User.portal_id == portal.id,
        User.is_active.is_(True),
        User.role == MANAGER,
        User.bitrix_user_id.in_(selected_ids),
    )

    return list(
        db.scalars(
            query.order_by(User.last_name, User.first_name, User.bitrix_user_id)
        )
    )
