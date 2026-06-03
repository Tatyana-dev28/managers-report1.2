from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.domain.submission_slots import AFTERNOON, EVENING, MORNING
from app.services.reminder_service import send_slot_reminders


scheduler = BackgroundScheduler(timezone=get_settings().timezone)


def send_reminder_job(slot: str) -> None:
    db = SessionLocal()
    try:
        result = send_slot_reminders(db=db, slot=slot, dry_run=False)
        print(
            "Reminders sent: "
            f"slot={slot}, {result.sent_count} sent, "
            f"{result.skipped_count} skipped, {result.failed_count} failed"
        )
    except Exception as error:
        db.rollback()
        print(f"Reminder job failed: slot={slot}, error={error}")
    finally:
        db.close()


def start_reminder_scheduler() -> None:
    settings = get_settings()
    if not settings.reminders_enabled:
        return

    add_reminder_job(MORNING, settings.morning_reminder_time)
    add_reminder_job(AFTERNOON, settings.afternoon_reminder_time)
    add_reminder_job(EVENING, settings.evening_reminder_time)

    if not scheduler.running:
        scheduler.start()


def add_reminder_job(slot: str, scheduled_time: str) -> None:
    hour, minute = parse_time(scheduled_time)
    scheduler.add_job(
        send_reminder_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour=hour,
            minute=minute,
            timezone=get_settings().timezone,
        ),
        args=[slot],
        id=f"send_{slot}_reminders",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )


def stop_reminder_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


def parse_time(value: str) -> tuple[int, int]:
    raw_hour, raw_minute = value.split(":", maxsplit=1)
    return int(raw_hour), int(raw_minute)
