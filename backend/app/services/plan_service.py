from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MetricPlan, User
from app.services.date_service import count_working_days, is_full_month, iter_month_ranges


def calculate_plan_for_period(
    db: Session,
    portal_id: int,
    user_id: int,
    metric_code: str,
    date_from: date,
    date_to: date,
) -> Decimal:
    total = Decimal("0")

    for range_start, range_end in iter_month_ranges(date_from, date_to):
        plan = db.scalar(
            select(MetricPlan).where(
                MetricPlan.portal_id == portal_id,
                MetricPlan.user_id == user_id,
                MetricPlan.metric_code == metric_code,
                MetricPlan.plan_year == range_start.year,
                MetricPlan.plan_month == range_start.month,
            )
        )
        if plan is None:
            continue

        if is_full_month(range_start, range_end):
            total += plan.monthly_value
        else:
            total += plan.daily_value * count_working_days(range_start, range_end)

    return total


def save_plans(
    db: Session,
    portal_id: int,
    created_by: User | None,
    plan_items,
) -> list[MetricPlan]:
    saved_plans: list[MetricPlan] = []

    for item in plan_items:
        user = db.scalar(
            select(User).where(
                User.portal_id == portal_id,
                User.bitrix_user_id == item.bitrix_user_id,
            )
        )
        if user is None:
            continue

        plan = db.scalar(
            select(MetricPlan).where(
                MetricPlan.portal_id == portal_id,
                MetricPlan.user_id == user.id,
                MetricPlan.metric_code == item.metric_code,
                MetricPlan.plan_year == item.plan_year,
                MetricPlan.plan_month == item.plan_month,
            )
        )
        if plan is None:
            plan = MetricPlan(
                portal_id=portal_id,
                user_id=user.id,
                metric_code=item.metric_code,
                plan_year=item.plan_year,
                plan_month=item.plan_month,
                daily_value=item.daily_value,
                monthly_value=item.monthly_value,
                created_by_user_id=created_by.id if created_by else None,
            )
            db.add(plan)
        else:
            plan.daily_value = item.daily_value
            plan.monthly_value = item.monthly_value
            plan.created_by_user_id = created_by.id if created_by else None

        saved_plans.append(plan)

    db.commit()
    return saved_plans
