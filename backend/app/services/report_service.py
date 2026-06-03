from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db.models import (
    ManagerSubmission,
    ManagerSubmissionValue,
    Portal,
    SystemMetricSnapshot,
    SystemMetricValue,
    User,
    UserActivityLog,
)
from app.domain.metrics import METRICS
from app.domain.plan_statuses import COMPLETED, NOT_COMPLETED, NO_PLAN, OVER_COMPLETED
from app.schemas.reports import EmployeeReportRead, ReportMetricRead, ReportRead
from app.services.date_service import count_working_days
from app.services.plan_service import calculate_plan_for_period
from app.services.report_assignee_service import get_report_assignee_users


def get_active_portal(db: Session) -> Portal | None:
    return db.scalar(select(Portal).where(Portal.is_active.is_(True)))


def get_manager_users(db: Session, portal_id: int) -> list[User]:
    portal = db.get(Portal, portal_id)
    if portal is None:
        return []

    return get_report_assignee_users(db, portal)


def get_metric_sums(
    db: Session,
    user_id: int,
    date_from: date,
    date_to: date,
) -> tuple[dict[str, Decimal], dict[str, Decimal]]:
    manager_values = dict(
        db.execute(
            select(
                ManagerSubmissionValue.metric_code,
                func.coalesce(func.sum(ManagerSubmissionValue.value), 0),
            )
            .join(ManagerSubmission)
            .where(
                ManagerSubmission.user_id == user_id,
                ManagerSubmission.report_date >= date_from,
                ManagerSubmission.report_date <= date_to,
            )
            .group_by(ManagerSubmissionValue.metric_code)
        ).all()
    )

    app_timezone = ZoneInfo(get_settings().timezone)
    period_start = datetime.combine(date_from, time.min, tzinfo=app_timezone)
    period_end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=app_timezone)
    system_values = dict(
        db.execute(
            select(
                SystemMetricValue.metric_code,
                func.coalesce(func.sum(SystemMetricValue.value), 0),
            )
            .join(SystemMetricSnapshot)
            .where(
                SystemMetricSnapshot.user_id == user_id,
                SystemMetricSnapshot.period_start >= period_start,
                SystemMetricSnapshot.period_end <= period_end,
            )
            .group_by(SystemMetricValue.metric_code)
        ).all()
    )

    return manager_values, system_values


def get_activity_status(
    db: Session,
    user_id: int,
    date_from: date,
    date_to: date,
) -> tuple[bool, bool]:
    app_timezone = ZoneInfo(get_settings().timezone)
    period_start = datetime.combine(date_from, time.min, tzinfo=app_timezone)
    period_end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=app_timezone)

    opened_app = db.scalar(
        select(UserActivityLog.id)
        .where(
            UserActivityLog.user_id == user_id,
            UserActivityLog.opened_at >= period_start,
            UserActivityLog.opened_at < period_end,
        )
        .limit(1)
    )
    submitted_data = db.scalar(
        select(ManagerSubmission.id)
        .where(
            ManagerSubmission.user_id == user_id,
            ManagerSubmission.report_date >= date_from,
            ManagerSubmission.report_date <= date_to,
        )
        .limit(1)
    )

    return opened_app is not None, submitted_data is not None


def get_plan_status(manager_value: Decimal, plan_value: Decimal) -> str:
    if plan_value == Decimal("0"):
        return NO_PLAN
    if manager_value < plan_value:
        return NOT_COMPLETED
    if manager_value == plan_value:
        return COMPLETED
    return OVER_COMPLETED


def format_metric_value(value: Decimal, is_money: bool) -> Decimal:
    if is_money:
        return value.quantize(Decimal("0.01"))
    return value.quantize(Decimal("1"))


def build_report(db: Session, date_from: date, date_to: date) -> ReportRead:
    portal = get_active_portal(db)
    if portal is None:
        return ReportRead(
            date_from=date_from,
            date_to=date_to,
            working_days=count_working_days(date_from, date_to),
            employees=[],
        )

    employees: list[EmployeeReportRead] = []
    for user in get_manager_users(db, portal.id):
        manager_values, system_values = get_metric_sums(db, user.id, date_from, date_to)
        opened_app, submitted_data = get_activity_status(db, user.id, date_from, date_to)

        metric_rows: list[ReportMetricRead] = []
        for metric in METRICS:
            manager_value = format_metric_value(
                manager_values.get(metric.code, Decimal("0.00")),
                metric.is_money,
            )
            system_value = format_metric_value(
                system_values.get(metric.code, Decimal("0.00")),
                metric.is_money,
            )
            plan_value = format_metric_value(
                calculate_plan_for_period(
                    db=db,
                    portal_id=portal.id,
                    user_id=user.id,
                    metric_code=metric.code,
                    date_from=date_from,
                    date_to=date_to,
                ),
                metric.is_money,
            )
            difference = format_metric_value(
                abs(manager_value - system_value),
                metric.is_money,
            )
            metric_rows.append(
                ReportMetricRead(
                    metric_code=metric.code,
                    metric_title=metric.title,
                    is_money=metric.is_money,
                    manager_value=manager_value,
                    system_value=system_value,
                    difference=difference,
                    plan_value=plan_value,
                    plan_status=get_plan_status(manager_value, plan_value),
                )
            )

        employees.append(
            EmployeeReportRead(
                user_id=user.id,
                bitrix_user_id=user.bitrix_user_id,
                full_name=" ".join(
                    part for part in (user.first_name, user.last_name) if part
                ),
                opened_app=opened_app,
                submitted_data=submitted_data,
                metrics=metric_rows,
            )
        )

    return ReportRead(
        date_from=date_from,
        date_to=date_to,
        working_days=count_working_days(date_from, date_to),
        employees=employees,
    )


def get_submissions_for_user(
    db: Session,
    bitrix_user_id: int,
    date_from: date,
    date_to: date,
) -> list[ManagerSubmission]:
    portal = get_active_portal(db)
    if portal is None:
        return []

    user = db.scalar(
        select(User).where(
            User.portal_id == portal.id,
            User.bitrix_user_id == bitrix_user_id,
        )
    )
    if user is None:
        return []

    return list(
        db.scalars(
            select(ManagerSubmission)
            .options(selectinload(ManagerSubmission.values))
            .where(
                ManagerSubmission.user_id == user.id,
                ManagerSubmission.report_date >= date_from,
                ManagerSubmission.report_date <= date_to,
            )
            .order_by(ManagerSubmission.submitted_at.desc())
        )
    )
