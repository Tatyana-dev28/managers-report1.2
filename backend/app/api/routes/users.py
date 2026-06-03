from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Portal, User
from app.db.session import get_db
from app.schemas.users import UserRead
from app.services.bitrix_users_service import sync_active_bitrix_users


router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def get_users(db: Session = Depends(get_db)) -> list[UserRead]:
    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        return []

    users = get_portal_users(db, portal)

    return [
        UserRead(
            id=user.id,
            bitrix_user_id=user.bitrix_user_id,
            first_name=user.first_name,
            last_name=user.last_name,
            role=user.role,
        )
        for user in users
    ]


def get_portal_users(db: Session, portal: Portal) -> list[User]:
    if get_settings().bitrix_webhook_url:
        try:
            return sync_active_bitrix_users(db, portal)
        except Exception:
            pass

    return db.scalars(
        select(User)
        .where(User.portal_id == portal.id, User.is_active.is_(True))
        .order_by(User.role.desc(), User.last_name, User.first_name, User.bitrix_user_id)
    ).all()
