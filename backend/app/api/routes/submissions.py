from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.models import ManagerSubmission
from app.db.session import get_db
from app.schemas.submissions import (
    SubmissionCreate,
    SubmissionRead,
    SubmissionValueRead,
)
from app.services.report_service import get_submissions_for_user
from app.services.submission_service import create_submission


router = APIRouter(prefix="/submissions", tags=["submissions"])


def serialize_submission(submission: ManagerSubmission) -> SubmissionRead:
    return SubmissionRead(
        id=submission.id,
        bitrix_user_id=submission.user.bitrix_user_id,
        report_date=submission.report_date,
        slot=submission.slot,
        submitted_at=submission.submitted_at,
        values=[
            SubmissionValueRead(metric_code=value.metric_code, value=value.value)
            for value in submission.values
        ],
    )


@router.post("", response_model=SubmissionRead)
def submit_manager_data(
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
) -> SubmissionRead:
    submission = create_submission(db, payload)
    return serialize_submission(submission)


@router.get("/my", response_model=list[SubmissionRead])
def get_my_submissions(
    bitrix_user_id: int = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
) -> list[SubmissionRead]:
    if date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be >= date_from")

    submissions = get_submissions_for_user(
        db=db,
        bitrix_user_id=bitrix_user_id,
        date_from=date_from,
        date_to=date_to,
    )
    return [serialize_submission(submission) for submission in submissions]
