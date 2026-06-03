from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Portal, ReminderLog, User
from app.domain.reminder_statuses import FAILED, SENT
from app.domain.submission_slots import SUBMISSION_SLOTS
from app.integrations.bitrix import BitrixRestClient
from app.schemas.reminders import (
    ReminderSendResponse,
    ReminderUserError,
    ReminderUserResult,
)
from app.services.date_service import get_today
from app.services.report_assignee_service import get_report_assignee_users


SLOT_LABELS = {
    "morning": "утренние",
    "afternoon": "дневные",
    "evening": "вечерние",
}


def send_slot_reminders(
    db: Session,
    slot: str,
    dry_run: bool = False,
) -> ReminderSendResponse:
    return send_reminders_to_active_managers(
        db=db,
        slot=slot,
        report_date=get_today(),
        dry_run=dry_run,
    )


def send_reminders_to_active_managers(
    db: Session,
    slot: str,
    report_date,
    dry_run: bool = False,
    bitrix_user_id: int | None = None,
) -> ReminderSendResponse:
    if slot not in SUBMISSION_SLOTS:
        raise HTTPException(status_code=422, detail="Invalid reminder slot")

    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        raise HTTPException(status_code=404, detail="Active portal not found")

    users = get_report_assignee_users(db, portal)
    if bitrix_user_id is not None:
        users = [
            user
            for user in users
            if user.bitrix_user_id == bitrix_user_id
        ]

    client = None if dry_run else BitrixRestClient()
    sent: list[ReminderUserResult] = []
    skipped: list[ReminderUserResult] = []
    failed: list[ReminderUserError] = []

    for user in users:
        existing_sent_log = db.scalar(
            select(ReminderLog).where(
                ReminderLog.portal_id == portal.id,
                ReminderLog.user_id == user.id,
                ReminderLog.report_date == report_date,
                ReminderLog.slot == slot,
                ReminderLog.status == SENT,
            )
        )
        if existing_sent_log is not None:
            skipped.append(build_user_result(user))
            continue

        if dry_run:
            sent.append(build_user_result(user))
            continue

        try:
            assert client is not None
            send_bitrix_notification(client, user.bitrix_user_id, slot)
            upsert_reminder_log(
                db=db,
                portal_id=portal.id,
                user_id=user.id,
                report_date=report_date,
                slot=slot,
                status=SENT,
                error_message=None,
            )
            sent.append(build_user_result(user))
        except Exception as error:
            db.rollback()
            upsert_reminder_log(
                db=db,
                portal_id=portal.id,
                user_id=user.id,
                report_date=report_date,
                slot=slot,
                status=FAILED,
                error_message=str(error),
            )
            failed.append(
                ReminderUserError(
                    bitrix_user_id=user.bitrix_user_id,
                    full_name=get_user_full_name(user),
                    error=str(error),
                )
            )

    db.commit()

    return ReminderSendResponse(
        report_date=report_date,
        slot=slot,
        dry_run=dry_run,
        sent_count=len(sent),
        skipped_count=len(skipped),
        failed_count=len(failed),
        sent=sent,
        skipped=skipped,
        failed=failed,
    )


def send_bitrix_notification(
    client: BitrixRestClient,
    bitrix_user_id: int,
    slot: str,
) -> None:
    message = build_reminder_message(bitrix_user_id=bitrix_user_id, slot=slot)
    client.call(
        "im.notify.personal.add",
        {
            "USER_ID": bitrix_user_id,
            "MESSAGE": message,
            "MESSAGE_OUT": strip_bitrix_links(message),
        },
    )


def build_reminder_message(bitrix_user_id: int, slot: str) -> str:
    slot_label = SLOT_LABELS.get(slot, "текущие")
    app_url = get_settings().frontend_app_url
    return (
        "Пора внести "
        f"{slot_label} показатели в приложение "
        f"[URL={app_url}]Ежедневный отчет менеджера[/URL]."
    )


def strip_bitrix_links(message: str) -> str:
    return (
        message.replace("[URL=", "")
        .replace("[/URL]", "")
        .replace("]", " ")
    )


def upsert_reminder_log(
    db: Session,
    portal_id: int,
    user_id: int,
    report_date,
    slot: str,
    status: str,
    error_message: str | None,
) -> None:
    reminder_log = db.scalar(
        select(ReminderLog).where(
            ReminderLog.portal_id == portal_id,
            ReminderLog.user_id == user_id,
            ReminderLog.report_date == report_date,
            ReminderLog.slot == slot,
        )
    )
    if reminder_log is None:
        reminder_log = ReminderLog(
            portal_id=portal_id,
            user_id=user_id,
            report_date=report_date,
            slot=slot,
            status=status,
        )
        db.add(reminder_log)

    reminder_log.sent_at = datetime.now(timezone.utc) if status == SENT else None
    reminder_log.status = status
    reminder_log.error_message = error_message


def build_user_result(user: User) -> ReminderUserResult:
    return ReminderUserResult(
        bitrix_user_id=user.bitrix_user_id,
        full_name=get_user_full_name(user),
    )


def get_user_full_name(user: User) -> str:
    return " ".join(part for part in (user.first_name, user.last_name) if part) or str(user.bitrix_user_id)
