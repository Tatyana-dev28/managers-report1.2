from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import ManagerSubmission, ManagerSubmissionValue, Portal, User
from app.domain.metrics import METRIC_CODES
from app.domain.submission_slots import SUBMISSION_SLOTS
from app.schemas.submissions import SubmissionCreate


def create_submission(db: Session, payload: SubmissionCreate) -> ManagerSubmission:
    if payload.slot not in SUBMISSION_SLOTS:
        raise HTTPException(status_code=422, detail="Invalid submission slot")

    invalid_metrics = [
        item.metric_code for item in payload.values if item.metric_code not in METRIC_CODES
    ]
    if invalid_metrics:
        raise HTTPException(status_code=422, detail=f"Invalid metrics: {invalid_metrics}")

    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        raise HTTPException(status_code=404, detail="Active portal not found")

    user = db.scalar(
        select(User).where(
            User.portal_id == portal.id,
            User.bitrix_user_id == payload.bitrix_user_id,
        )
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    app_timezone = ZoneInfo(get_settings().timezone)
    period_start = datetime.combine(payload.report_date, time.min, tzinfo=app_timezone)
    period_end = period_start + timedelta(days=1)

    submission = ManagerSubmission(
        portal_id=portal.id,
        user_id=user.id,
        report_date=payload.report_date,
        period_start=period_start,
        period_end=period_end,
        slot=payload.slot,
    )
    db.add(submission)
    db.flush()

    for item in payload.values:
        db.add(
            ManagerSubmissionValue(
                submission_id=submission.id,
                metric_code=item.metric_code,
                value=item.value,
            )
        )

    db.commit()
    db.refresh(submission)
    return submission
