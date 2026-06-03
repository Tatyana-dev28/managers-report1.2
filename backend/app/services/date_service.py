from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import get_settings


def get_today() -> date:
    return datetime.now(ZoneInfo(get_settings().timezone)).date()


def count_working_days(date_from: date, date_to: date) -> int:
    if date_to < date_from:
        return 0

    current_date = date_from
    working_days = 0
    while current_date <= date_to:
        if current_date.weekday() < 5:
            working_days += 1
        current_date += timedelta(days=1)

    return working_days


def iter_month_ranges(date_from: date, date_to: date):
    current = date_from
    while current <= date_to:
        if current.month == 12:
            next_month = date(current.year + 1, 1, 1)
        else:
            next_month = date(current.year, current.month + 1, 1)

        month_end = min(date_to, next_month - timedelta(days=1))
        yield current, month_end
        current = month_end + timedelta(days=1)


def is_full_month(date_from: date, date_to: date) -> bool:
    if date_from.day != 1:
        return False

    if date_from.month == 12:
        next_month = date(date_from.year + 1, 1, 1)
    else:
        next_month = date(date_from.year, date_from.month + 1, 1)

    return date_to == next_month - timedelta(days=1)
