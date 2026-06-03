from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Portal, User
from app.domain.roles import LEADER, MANAGER
from app.integrations.bitrix import BitrixRestClient


def sync_active_bitrix_users(db: Session, portal: Portal) -> list[User]:
    client = BitrixRestClient()
    bitrix_users = client.list_all(
        "user.get",
        {
            "FILTER": {
                "ACTIVE": True,
                "USER_TYPE": "employee",
            },
        },
    )

    existing_users = db.scalars(
        select(User).where(User.portal_id == portal.id)
    ).all()
    users_by_bitrix_id = {user.bitrix_user_id: user for user in existing_users}
    synced_bitrix_user_ids: set[int] = set()

    for bitrix_user in bitrix_users:
        bitrix_user_id = as_int(bitrix_user.get("ID"))
        if bitrix_user_id is None:
            continue
        synced_bitrix_user_ids.add(bitrix_user_id)

        user = users_by_bitrix_id.get(bitrix_user_id)
        if user is None:
            user = User(
                portal_id=portal.id,
                bitrix_user_id=bitrix_user_id,
                role=MANAGER,
            )
            db.add(user)
            users_by_bitrix_id[bitrix_user_id] = user

        user.first_name = as_optional_str(bitrix_user.get("NAME"))
        user.last_name = as_optional_str(bitrix_user.get("LAST_NAME"))
        if user.role != LEADER:
            user.role = MANAGER
        user.is_active = bool(bitrix_user.get("ACTIVE", True))

    for user in existing_users:
        if user.bitrix_user_id not in synced_bitrix_user_ids:
            user.is_active = False

    db.commit()

    return db.scalars(
        select(User)
        .where(User.portal_id == portal.id, User.is_active.is_(True))
        .order_by(User.role.desc(), User.last_name, User.first_name, User.bitrix_user_id)
    ).all()


def as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def as_optional_str(value: Any) -> str | None:
    return None if value is None else str(value)


def is_manager_bitrix_user(bitrix_user: dict[str, Any]) -> bool:
    if not bool(bitrix_user.get("ACTIVE", True)):
        return False

    work_position = str(bitrix_user.get("WORK_POSITION") or "").casefold()
    keywords = [
        item.strip().casefold()
        for item in get_settings().manager_work_position_keywords.split(",")
        if item.strip()
    ]
    if not keywords:
        return True

    return any(keyword in work_position for keyword in keywords)
