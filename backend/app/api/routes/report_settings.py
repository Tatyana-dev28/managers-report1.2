from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.report_settings import (
    ReportAssigneesRead,
    ReportAssigneesSaveRequest,
    ReportAssigneesSaveResponse,
)
from app.services.report_settings_service import (
    get_report_assignees,
    save_report_assignees,
)


router = APIRouter(prefix="/report-settings", tags=["report-settings"])


@router.get("/assignees", response_model=ReportAssigneesRead)
def read_report_assignees(db: Session = Depends(get_db)) -> ReportAssigneesRead:
    return get_report_assignees(db)


@router.post("/assignees", response_model=ReportAssigneesSaveResponse)
def update_report_assignees(
    payload: ReportAssigneesSaveRequest,
    db: Session = Depends(get_db),
) -> ReportAssigneesSaveResponse:
    return save_report_assignees(db, payload.bitrix_user_ids)
