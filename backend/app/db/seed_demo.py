from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import (
    ManagerSubmission,
    ManagerSubmissionValue,
    MetricPlan,
    Portal,
    PortalAuth,
    PortalSetting,
    ReminderLog,
    SystemMetricSnapshot,
    SystemMetricValue,
    User,
    UserActivityLog,
)
from app.db.session import SessionLocal
from app.domain.metrics import METRIC_CODES
from app.domain.reminder_statuses import SENT
from app.domain.roles import LEADER, MANAGER
from app.domain.submission_slots import AFTERNOON, EVENING, MORNING


DEMO_PORTAL_DOMAIN = "demo.local"
DEMO_MEMBER_ID = "demo-member"

DEMO_USERS = (
    {"bitrix_user_id": 1, "first_name": "Leader", "last_name": "Demo"},
    {"bitrix_user_id": 101, "first_name": "Anna", "last_name": "Ivanova"},
    {"bitrix_user_id": 102, "first_name": "Ivan", "last_name": "Petrov"},
    {"bitrix_user_id": 103, "first_name": "Pavel", "last_name": "Sidorov"},
)

MANAGER_BITRIX_IDS = (101, 102, 103)
LEADER_BITRIX_ID = 1

BASE_DAILY_PLANS = {
    "meetings_held": Decimal("2"),
    "meetings_created": Decimal("2"),
    "calls_total": Decimal("35"),
    "outgoing_calls": Decimal("25"),
    "successful_outgoing_calls": Decimal("15"),
    "incoming_calls": Decimal("10"),
    "commercial_offers_sent": Decimal("3"),
    "contracts_sent": Decimal("2"),
    "contracts_signed": Decimal("1"),
    "invoices_sent": Decimal("3"),
    "invoices_paid": Decimal("1"),
    "new_deals": Decimal("4"),
    "successful_sale_deals": Decimal("1"),
    "paid_invoice_sum": Decimal("50000"),
}

SYSTEM_VALUES_BY_MANAGER = {
    101: {
        "meetings_held": Decimal("2"),
        "meetings_created": Decimal("3"),
        "calls_total": Decimal("42"),
        "outgoing_calls": Decimal("30"),
        "successful_outgoing_calls": Decimal("18"),
        "incoming_calls": Decimal("12"),
        "commercial_offers_sent": Decimal("4"),
        "contracts_sent": Decimal("2"),
        "contracts_signed": Decimal("1"),
        "invoices_sent": Decimal("4"),
        "invoices_paid": Decimal("2"),
        "new_deals": Decimal("5"),
        "successful_sale_deals": Decimal("1"),
        "paid_invoice_sum": Decimal("95000"),
    },
    102: {
        "meetings_held": Decimal("1"),
        "meetings_created": Decimal("1"),
        "calls_total": Decimal("29"),
        "outgoing_calls": Decimal("21"),
        "successful_outgoing_calls": Decimal("12"),
        "incoming_calls": Decimal("8"),
        "commercial_offers_sent": Decimal("2"),
        "contracts_sent": Decimal("1"),
        "contracts_signed": Decimal("0"),
        "invoices_sent": Decimal("2"),
        "invoices_paid": Decimal("1"),
        "new_deals": Decimal("3"),
        "successful_sale_deals": Decimal("0"),
        "paid_invoice_sum": Decimal("42000"),
    },
    103: {
        "meetings_held": Decimal("2"),
        "meetings_created": Decimal("2"),
        "calls_total": Decimal("36"),
        "outgoing_calls": Decimal("24"),
        "successful_outgoing_calls": Decimal("14"),
        "incoming_calls": Decimal("12"),
        "commercial_offers_sent": Decimal("3"),
        "contracts_sent": Decimal("2"),
        "contracts_signed": Decimal("1"),
        "invoices_sent": Decimal("3"),
        "invoices_paid": Decimal("1"),
        "new_deals": Decimal("4"),
        "successful_sale_deals": Decimal("1"),
        "paid_invoice_sum": Decimal("51000"),
    },
}

MANAGER_SUBMISSIONS = {
    101: {
        MORNING: {
            "meetings_held": Decimal("1"),
            "meetings_created": Decimal("1"),
            "calls_total": Decimal("15"),
            "outgoing_calls": Decimal("11"),
            "successful_outgoing_calls": Decimal("7"),
            "incoming_calls": Decimal("4"),
            "commercial_offers_sent": Decimal("1"),
            "contracts_sent": Decimal("1"),
            "contracts_signed": Decimal("0"),
            "invoices_sent": Decimal("1"),
            "invoices_paid": Decimal("0"),
            "new_deals": Decimal("2"),
            "successful_sale_deals": Decimal("0"),
            "paid_invoice_sum": Decimal("0"),
        },
        AFTERNOON: {
            "meetings_held": Decimal("1"),
            "meetings_created": Decimal("1"),
            "calls_total": Decimal("18"),
            "outgoing_calls": Decimal("13"),
            "successful_outgoing_calls": Decimal("8"),
            "incoming_calls": Decimal("5"),
            "commercial_offers_sent": Decimal("2"),
            "contracts_sent": Decimal("1"),
            "contracts_signed": Decimal("1"),
            "invoices_sent": Decimal("2"),
            "invoices_paid": Decimal("1"),
            "new_deals": Decimal("2"),
            "successful_sale_deals": Decimal("1"),
            "paid_invoice_sum": Decimal("62000"),
        },
    },
    102: {
        MORNING: {
            "meetings_held": Decimal("0"),
            "meetings_created": Decimal("0"),
            "calls_total": Decimal("10"),
            "outgoing_calls": Decimal("8"),
            "successful_outgoing_calls": Decimal("4"),
            "incoming_calls": Decimal("2"),
            "commercial_offers_sent": Decimal("1"),
            "contracts_sent": Decimal("0"),
            "contracts_signed": Decimal("0"),
            "invoices_sent": Decimal("1"),
            "invoices_paid": Decimal("0"),
            "new_deals": Decimal("1"),
            "successful_sale_deals": Decimal("0"),
            "paid_invoice_sum": Decimal("0"),
        },
    },
}


def get_or_create_portal(db: Session) -> Portal:
    portal = db.scalar(select(Portal).where(Portal.bitrix_domain == DEMO_PORTAL_DOMAIN))
    if portal is None:
        portal = Portal(
            bitrix_domain=DEMO_PORTAL_DOMAIN,
            member_id=DEMO_MEMBER_ID,
            is_active=True,
            installed_at=datetime.now(timezone.utc),
        )
        db.add(portal)
        db.flush()
    return portal


def upsert_portal_auth(db: Session, portal: Portal) -> None:
    auth = db.scalar(select(PortalAuth).where(PortalAuth.portal_id == portal.id))
    if auth is None:
        auth = PortalAuth(
            portal_id=portal.id,
            access_token_encrypted="demo-only-access-token-placeholder",
            refresh_token_encrypted="demo-only-refresh-token-placeholder",
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            scope="demo",
        )
        db.add(auth)
    else:
        auth.expires_at = datetime.now(timezone.utc) + timedelta(days=30)


def get_or_create_users(db: Session, portal: Portal) -> dict[int, User]:
    users: dict[int, User] = {}
    for demo_user in DEMO_USERS:
        user = db.scalar(
            select(User).where(
                User.portal_id == portal.id,
                User.bitrix_user_id == demo_user["bitrix_user_id"],
            )
        )
        if user is None:
            user = User(
                portal_id=portal.id,
                bitrix_user_id=demo_user["bitrix_user_id"],
            )
            db.add(user)
            db.flush()

        user.first_name = demo_user["first_name"]
        user.last_name = demo_user["last_name"]
        user.role = LEADER if user.bitrix_user_id == LEADER_BITRIX_ID else MANAGER
        user.is_active = True
        users[user.bitrix_user_id] = user

    return users


def upsert_settings(db: Session, portal: Portal) -> None:
    settings = {
        "morning_reminder_time": "09:00",
        "afternoon_reminder_time": "13:00",
        "evening_reminder_time": "17:00",
        "demo_mode": "true",
    }

    for key, value in settings.items():
        setting = db.scalar(
            select(PortalSetting).where(
                PortalSetting.portal_id == portal.id,
                PortalSetting.key == key,
            )
        )
        if setting is None:
            db.add(PortalSetting(portal_id=portal.id, key=key, value=value))
        else:
            setting.value = value


def upsert_metric_values(
    db: Session,
    existing_values: list[ManagerSubmissionValue] | list[SystemMetricValue],
    value_model: type[ManagerSubmissionValue] | type[SystemMetricValue],
    parent_field: str,
    parent_id: int,
    values: dict[str, Decimal],
) -> None:
    by_metric = {value.metric_code: value for value in existing_values}
    for metric_code, value in values.items():
        if metric_code not in METRIC_CODES:
            continue

        existing = by_metric.get(metric_code)
        if existing is None:
            db.add(
                value_model(
                    **{
                        parent_field: parent_id,
                        "metric_code": metric_code,
                        "value": value,
                    }
                )
            )
        else:
            existing.value = value


def upsert_system_snapshot(
    db: Session,
    portal: Portal,
    user: User,
    report_date: date,
    period_start: datetime,
    period_end: datetime,
    values: dict[str, Decimal],
) -> None:
    snapshot = db.scalar(
        select(SystemMetricSnapshot).where(
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
            calculated_at=datetime.now(timezone.utc),
        )
        db.add(snapshot)
        db.flush()
    else:
        snapshot.calculated_at = datetime.now(timezone.utc)

    upsert_metric_values(
        db=db,
        existing_values=snapshot.values,
        value_model=SystemMetricValue,
        parent_field="snapshot_id",
        parent_id=snapshot.id,
        values=values,
    )


def upsert_submission(
    db: Session,
    portal: Portal,
    user: User,
    report_date: date,
    period_start: datetime,
    period_end: datetime,
    slot: str,
    values: dict[str, Decimal],
) -> None:
    submission = db.scalar(
        select(ManagerSubmission).where(
            ManagerSubmission.portal_id == portal.id,
            ManagerSubmission.user_id == user.id,
            ManagerSubmission.report_date == report_date,
            ManagerSubmission.slot == slot,
        )
    )
    if submission is None:
        submission = ManagerSubmission(
            portal_id=portal.id,
            user_id=user.id,
            report_date=report_date,
            period_start=period_start,
            period_end=period_end,
            slot=slot,
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(submission)
        db.flush()
    else:
        submission.submitted_at = datetime.now(timezone.utc)

    upsert_metric_values(
        db=db,
        existing_values=submission.values,
        value_model=ManagerSubmissionValue,
        parent_field="submission_id",
        parent_id=submission.id,
        values=values,
    )


def upsert_metric_plans(
    db: Session,
    portal: Portal,
    users: dict[int, User],
    report_date: date,
) -> None:
    leader = users[LEADER_BITRIX_ID]
    for bitrix_user_id in MANAGER_BITRIX_IDS:
        user = users[bitrix_user_id]
        for metric_code, daily_value in BASE_DAILY_PLANS.items():
            plan = db.scalar(
                select(MetricPlan).where(
                    MetricPlan.portal_id == portal.id,
                    MetricPlan.user_id == user.id,
                    MetricPlan.metric_code == metric_code,
                    MetricPlan.plan_year == report_date.year,
                    MetricPlan.plan_month == report_date.month,
                )
            )
            monthly_value = daily_value * Decimal("22")
            if plan is None:
                db.add(
                    MetricPlan(
                        portal_id=portal.id,
                        user_id=user.id,
                        metric_code=metric_code,
                        plan_year=report_date.year,
                        plan_month=report_date.month,
                        daily_value=daily_value,
                        monthly_value=monthly_value,
                        created_by_user_id=leader.id,
                    )
                )
            else:
                plan.daily_value = daily_value
                plan.monthly_value = monthly_value
                plan.created_by_user_id = leader.id


def add_activity_logs(
    db: Session,
    portal: Portal,
    users: dict[int, User],
    report_date: date,
    app_timezone: ZoneInfo,
) -> None:
    opened_at = datetime.combine(report_date, time(hour=9, minute=20), tzinfo=app_timezone)
    for bitrix_user_id in (101, 102):
        user = users[bitrix_user_id]
        existing = db.scalar(
            select(UserActivityLog).where(
                UserActivityLog.portal_id == portal.id,
                UserActivityLog.user_id == user.id,
                UserActivityLog.opened_at == opened_at,
            )
        )
        if existing is None:
            db.add(
                UserActivityLog(
                    portal_id=portal.id,
                    user_id=user.id,
                    opened_at=opened_at,
                )
            )
        user.last_seen_at = opened_at


def upsert_reminder_logs(
    db: Session,
    portal: Portal,
    users: dict[int, User],
    report_date: date,
    app_timezone: ZoneInfo,
) -> None:
    slot_times = {
        MORNING: time(hour=9),
        AFTERNOON: time(hour=13),
        EVENING: time(hour=17),
    }
    for bitrix_user_id in MANAGER_BITRIX_IDS:
        user = users[bitrix_user_id]
        for slot, slot_time in slot_times.items():
            sent_at = datetime.combine(report_date, slot_time, tzinfo=app_timezone)
            reminder = db.scalar(
                select(ReminderLog).where(
                    ReminderLog.portal_id == portal.id,
                    ReminderLog.user_id == user.id,
                    ReminderLog.report_date == report_date,
                    ReminderLog.slot == slot,
                )
            )
            if reminder is None:
                db.add(
                    ReminderLog(
                        portal_id=portal.id,
                        user_id=user.id,
                        report_date=report_date,
                        slot=slot,
                        sent_at=sent_at,
                        status=SENT,
                    )
                )
            else:
                reminder.sent_at = sent_at
                reminder.status = SENT
                reminder.error_message = None


def seed_demo() -> None:
    settings = get_settings()
    app_timezone = ZoneInfo(settings.timezone)
    report_date = datetime.now(app_timezone).date() - timedelta(days=1)
    period_start = datetime.combine(report_date, time.min, tzinfo=app_timezone)
    period_end = period_start + timedelta(days=1)

    with SessionLocal() as db:
        portal = get_or_create_portal(db)
        upsert_portal_auth(db, portal)
        users = get_or_create_users(db, portal)
        upsert_settings(db, portal)
        upsert_metric_plans(db, portal, users, report_date)

        for bitrix_user_id, values in SYSTEM_VALUES_BY_MANAGER.items():
            upsert_system_snapshot(
                db=db,
                portal=portal,
                user=users[bitrix_user_id],
                report_date=report_date,
                period_start=period_start,
                period_end=period_end,
                values=values,
            )

        for bitrix_user_id, submissions_by_slot in MANAGER_SUBMISSIONS.items():
            for slot, values in submissions_by_slot.items():
                upsert_submission(
                    db=db,
                    portal=portal,
                    user=users[bitrix_user_id],
                    report_date=report_date,
                    period_start=period_start,
                    period_end=period_end,
                    slot=slot,
                    values=values,
                )

        add_activity_logs(db, portal, users, report_date, app_timezone)
        upsert_reminder_logs(db, portal, users, report_date, app_timezone)
        db.commit()

    print(f"Demo data seeded for {report_date.isoformat()}.")


if __name__ == "__main__":
    seed_demo()
