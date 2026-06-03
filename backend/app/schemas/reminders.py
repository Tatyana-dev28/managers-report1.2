from datetime import date

from pydantic import BaseModel


class ReminderSendRequest(BaseModel):
    report_date: date | None = None
    slot: str
    dry_run: bool = True
    bitrix_user_id: int | None = None


class ReminderUserResult(BaseModel):
    bitrix_user_id: int
    full_name: str


class ReminderUserError(BaseModel):
    bitrix_user_id: int
    full_name: str
    error: str


class ReminderSendResponse(BaseModel):
    report_date: date
    slot: str
    dry_run: bool
    sent_count: int
    skipped_count: int
    failed_count: int
    sent: list[ReminderUserResult]
    skipped: list[ReminderUserResult]
    failed: list[ReminderUserError]
