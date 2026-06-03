from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db.models import Portal, SystemMetricSnapshot, SystemMetricValue, User
from app.domain.metrics import METRIC_CODES
from app.schemas.system_metrics import SystemMetricsSaveRequest


def save_system_metrics_snapshot(
    db: Session,
    bitrix_user_id: int,
    report_date: date,
    values: dict[str, Decimal],
) -> None:
    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        raise HTTPException(status_code=404, detail="Active portal not found")

    user = db.scalar(
        select(User).where(
            User.portal_id == portal.id,
            User.bitrix_user_id == bitrix_user_id,
        )
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    app_timezone = ZoneInfo(get_settings().timezone)
    period_start = datetime.combine(report_date, time.min, tzinfo=app_timezone)
    period_end = period_start + timedelta(days=1)

    snapshot = db.scalar(
        select(SystemMetricSnapshot)
        .options(selectinload(SystemMetricSnapshot.values))
        .where(
            SystemMetricSnapshot.portal_id == portal.id,
            SystemMetricSnapshot.user_id == user.id,
            SystemMetricSnapshot.period_start == period_start,
            SystemMetricSnapshot.period_end == period_end,
        )
    )

    if snapshot is None:
        snapshot = SystemMetricSnapshot(
            portal_id=portal.id,
            user_id=user.id,
            report_date=report_date,
            period_start=period_start,
            period_end=period_end,
        )
        db.add(snapshot)
        db.flush()

    values_by_metric = {value.metric_code: value for value in snapshot.values}
    for metric_code, value in values.items():
        existing = values_by_metric.get(metric_code)
        if existing is None:
            db.add(
                SystemMetricValue(
                    snapshot_id=snapshot.id,
                    metric_code=metric_code,
                    value=value,
                )
            )
        else:
            existing.value = value

    db.commit()


def save_demo_system_metrics(db: Session, payload: SystemMetricsSaveRequest) -> None:
    invalid_metrics = [
        item.metric_code for item in payload.values if item.metric_code not in METRIC_CODES
    ]
    if invalid_metrics:
        raise HTTPException(status_code=422, detail=f"Invalid metrics: {invalid_metrics}")

    save_system_metrics_snapshot(
        db=db,
        bitrix_user_id=payload.bitrix_user_id,
        report_date=payload.report_date,
        values={item.metric_code: item.value for item in payload.values},
    )
