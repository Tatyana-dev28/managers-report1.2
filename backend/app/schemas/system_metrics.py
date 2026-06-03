from datetime import date

from app.schemas.submissions import MetricValueInput
from pydantic import BaseModel


class SystemMetricsSaveRequest(BaseModel):
    bitrix_user_id: int
    report_date: date
    values: list[MetricValueInput]


class SystemMetricsSaveResponse(BaseModel):
    status: str
