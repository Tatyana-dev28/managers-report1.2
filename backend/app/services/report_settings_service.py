import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Portal, PortalSetting, User
from app.domain.roles import MANAGER
from app.schemas.report_settings import (
    ReportAssigneesRead,
    ReportAssigneesSaveResponse,
)
from app.schemas.users import UserRead
from app.services.bitrix_users_service import sync_active_bitrix_users


REPORT_ASSIGNEE_USER_IDS_KEY = "report_assignee_bitrix_user_ids"


def get_active_portal_or_404(db: Session) -> Portal:
    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        raise HTTPException(status_code=404, detail="Active portal not found")
    return portal


def get_report_assignees(db: Session) -> ReportAssigneesRead:
    portal = get_active_portal_or_404(db)
    users = sync_active_bitrix_users(db, portal)
    selected_ids = get_selected_assignee_bitrix_user_ids(db, portal.id)

    return ReportAssigneesRead(
        selected_bitrix_user_ids=selected_ids,
        available_users=[
            serialize_user(user)
            for user in users
            if user.role == MANAGER
        ],
    )


def save_report_assignees(
    db: Session,
    bitrix_user_ids: list[int],
) -> ReportAssigneesSaveResponse:
    portal = get_active_portal_or_404(db)
    unique_ids = sorted(set(bitrix_user_ids))
    setting = db.scalar(
        select(PortalSetting).where(
            PortalSetting.portal_id == portal.id,
            PortalSetting.key == REPORT_ASSIGNEE_USER_IDS_KEY,
        )
    )
    if setting is None:
        setting = PortalSetting(
            portal_id=portal.id,
            key=REPORT_ASSIGNEE_USER_IDS_KEY,
            value="[]",
        )
        db.add(setting)

    setting.value = json.dumps(unique_ids)
    db.commit()
    return ReportAssigneesSaveResponse(selected_bitrix_user_ids=unique_ids)


def get_selected_assignee_bitrix_user_ids(db: Session, portal_id: int) -> list[int]:
    setting = db.scalar(
        select(PortalSetting).where(
            PortalSetting.portal_id == portal_id,
            PortalSetting.key == REPORT_ASSIGNEE_USER_IDS_KEY,
        )
    )
    if setting is None:
        return []

    try:
        raw_values = json.loads(setting.value)
    except json.JSONDecodeError:
        return []

    return sorted(
        {
            int(value)
            for value in raw_values
            if str(value).isdigit()
        }
    )


def serialize_user(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        bitrix_user_id=user.bitrix_user_id,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
    )
