from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.reports import ReportRead
from app.services.report_service import build_report


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=ReportRead)
def get_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
) -> ReportRead:
    if date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be >= date_from")

    return build_report(db, date_from=date_from, date_to=date_to)
