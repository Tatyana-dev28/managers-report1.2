from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class MetricValueInput(BaseModel):
    metric_code: str
    value: Decimal = Field(ge=0)


class SubmissionCreate(BaseModel):
    bitrix_user_id: int
    report_date: date
    slot: str
    values: list[MetricValueInput]


class SubmissionValueRead(BaseModel):
    metric_code: str
    value: Decimal


class SubmissionRead(BaseModel):
    id: int
    bitrix_user_id: int
    report_date: date
    slot: str
    submitted_at: datetime
    values: list[SubmissionValueRead]
