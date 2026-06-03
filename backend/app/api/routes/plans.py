from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MetricPlan, Portal, User
from app.db.session import get_db
from app.domain.metrics import METRIC_CODES
from app.schemas.plans import PlanPeriodPreview, PlanRead, PlansSaveRequest
from app.services.date_service import count_working_days
from app.services.plan_service import save_plans


router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("", response_model=list[PlanRead])
def get_plans(
    plan_year: int = Query(..., ge=2000),
    plan_month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
) -> list[PlanRead]:
    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        return []

    rows = db.execute(
        select(MetricPlan, User.bitrix_user_id)
        .join(User, User.id == MetricPlan.user_id)
        .where(
            MetricPlan.portal_id == portal.id,
            MetricPlan.plan_year == plan_year,
            MetricPlan.plan_month == plan_month,
        )
        .order_by(User.bitrix_user_id, MetricPlan.metric_code)
    ).all()

    return [
        PlanRead(
            bitrix_user_id=bitrix_user_id,
            metric_code=plan.metric_code,
            plan_year=plan.plan_year,
            plan_month=plan.plan_month,
            daily_value=plan.daily_value,
            monthly_value=plan.monthly_value,
        )
        for plan, bitrix_user_id in rows
    ]


@router.post("", response_model=list[PlanRead])
def save_plan_values(
    payload: PlansSaveRequest,
    db: Session = Depends(get_db),
) -> list[PlanRead]:
    invalid_metrics = [
        item.metric_code for item in payload.plans if item.metric_code not in METRIC_CODES
    ]
    if invalid_metrics:
        raise HTTPException(status_code=422, detail=f"Invalid metrics: {invalid_metrics}")

    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        raise HTTPException(status_code=404, detail="Active portal not found")

    created_by = db.scalar(
        select(User).where(
            User.portal_id == portal.id,
            User.bitrix_user_id == payload.created_by_bitrix_user_id,
        )
    )

    saved_plans = save_plans(
        db=db,
        portal_id=portal.id,
        created_by=created_by,
        plan_items=payload.plans,
    )

    return [
        PlanRead(
            bitrix_user_id=plan.user.bitrix_user_id,
            metric_code=plan.metric_code,
            plan_year=plan.plan_year,
            plan_month=plan.plan_month,
            daily_value=plan.daily_value,
            monthly_value=plan.monthly_value,
        )
        for plan in saved_plans
    ]


@router.get("/period-preview", response_model=PlanPeriodPreview)
def get_plan_period_preview(
    date_from: date = Query(...),
    date_to: date = Query(...),
) -> PlanPeriodPreview:
    if date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be >= date_from")

    return PlanPeriodPreview(
        date_from=date_from,
        date_to=date_to,
        working_days=count_working_days(date_from, date_to),
    )
