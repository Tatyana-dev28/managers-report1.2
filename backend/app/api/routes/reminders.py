from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.reminders import ReminderSendRequest, ReminderSendResponse
from app.services.date_service import get_today
from app.services.reminder_service import send_reminders_to_active_managers


router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.post("/send", response_model=ReminderSendResponse)
def send_reminders(
    payload: ReminderSendRequest,
    db: Session = Depends(get_db),
) -> ReminderSendResponse:
    return send_reminders_to_active_managers(
        db=db,
        slot=payload.slot,
        report_date=payload.report_date or get_today(),
        dry_run=payload.dry_run,
        bitrix_user_id=payload.bitrix_user_id,
    )
