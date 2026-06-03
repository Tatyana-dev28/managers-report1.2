from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.bitrix_metrics_service import (
    collect_active_manager_system_metrics,
    ensure_bitrix_metric_settings_ready,
)
from app.services.date_service import get_today


scheduler = BackgroundScheduler(timezone=get_settings().timezone)


def collect_today_system_metrics() -> None:
    try:
        ensure_bitrix_metric_settings_ready()
    except Exception:
        return

    db = SessionLocal()
    try:
        result = collect_active_manager_system_metrics(
            db=db,
            report_date=get_today(),
        )
        print(
            "System metrics collected: "
            f"{result.collected_count} ok, {result.failed_count} failed"
        )
    except Exception as error:
        db.rollback()
        print(f"System metrics collection failed: {error}")
    finally:
        db.close()


def start_system_metrics_scheduler() -> None:
    settings = get_settings()
    if not settings.system_metrics_auto_collect_enabled:
        return

    if scheduler.get_job("collect_system_metrics_hourly") is None:
        scheduler.add_job(
            collect_today_system_metrics,
            trigger=IntervalTrigger(
                minutes=settings.system_metrics_collect_interval_minutes,
                timezone=settings.timezone,
            ),
            id="collect_system_metrics_hourly",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=datetime.now(ZoneInfo(settings.timezone)),
        )

    if not scheduler.running:
        scheduler.start()


def stop_system_metrics_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
