from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import Portal, User, UserActivityLog
from app.domain.roles import LEADER, MANAGER
from app.schemas.users import AuthUserRequest, UserRead


def get_or_create_portal(db: Session, payload: AuthUserRequest) -> Portal:
    domain = payload.domain or "local.dev"
    portal = None

    if payload.member_id:
        portal = db.scalar(select(Portal).where(Portal.member_id == payload.member_id))

    if portal is None:
        portal = db.scalar(select(Portal).where(Portal.bitrix_domain == domain))

    if portal is None:
        portal = Portal(
            bitrix_domain=domain,
            member_id=payload.member_id,
            is_active=True,
            installed_at=datetime.now(timezone.utc),
        )
        db.add(portal)
        db.flush()
    else:
        portal.bitrix_domain = domain
        if payload.member_id:
            portal.member_id = payload.member_id
        portal.is_active = True

    db.flush()
    db.execute(
        update(Portal)
        .where(Portal.id != portal.id)
        .values(is_active=False)
    )
    portal.is_active = True

    return portal


def resolve_user_role(_user: User | None, is_admin: bool) -> str:
    return LEADER if is_admin else MANAGER


def authenticate_user(db: Session, payload: AuthUserRequest) -> UserRead:
    portal = get_or_create_portal(db, payload)
    user = db.scalar(
        select(User).where(
            User.portal_id == portal.id,
            User.bitrix_user_id == payload.bitrix_user_id,
        )
    )
    role = resolve_user_role(user, payload.is_admin)
    now = datetime.now(timezone.utc)

    if user is None:
        user = User(
            portal_id=portal.id,
            bitrix_user_id=payload.bitrix_user_id,
            role=role,
        )
        db.add(user)
        db.flush()
    else:
        user.role = role

    user.first_name = payload.first_name
    user.last_name = payload.last_name
    user.is_active = True
    user.last_seen_at = now

    db.add(
        UserActivityLog(
            portal_id=portal.id,
            user_id=user.id,
            opened_at=now,
        )
    )
    db.commit()
    db.refresh(user)

    return UserRead(
        id=user.id,
        bitrix_user_id=user.bitrix_user_id,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
    )
