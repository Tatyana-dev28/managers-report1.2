from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Portal, User
from app.db.session import get_db
from app.schemas.system_metrics import SystemMetricsSaveRequest, SystemMetricsSaveResponse
from app.schemas.users import UserRead
from app.domain.roles import LEADER, MANAGER
from app.services.system_metrics_service import save_demo_system_metrics


router = APIRouter(prefix="/demo", tags=["demo"])

DEMO_LEADER_BITRIX_USER_ID = 1


@router.get("/users", response_model=list[UserRead])
def get_demo_users(db: Session = Depends(get_db)) -> list[UserRead]:
    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        return []

    users = db.scalars(
        select(User)
        .where(User.portal_id == portal.id, User.is_active.is_(True))
        .order_by(User.bitrix_user_id)
    )

    return [
        UserRead(
            id=user.id,
            bitrix_user_id=user.bitrix_user_id,
            first_name=user.first_name,
            last_name=user.last_name,
            role=LEADER if user.bitrix_user_id == DEMO_LEADER_BITRIX_USER_ID else MANAGER,
        )
        for user in users
    ]


@router.post("/system-metrics", response_model=SystemMetricsSaveResponse)
def save_system_metrics(
    payload: SystemMetricsSaveRequest,
    db: Session = Depends(get_db),
) -> SystemMetricsSaveResponse:
    save_demo_system_metrics(db, payload)
    return SystemMetricsSaveResponse(status="ok")
