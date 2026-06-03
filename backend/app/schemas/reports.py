from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class ReportMetricRead(BaseModel):
    metric_code: str
    metric_title: str
    is_money: bool
    manager_value: Decimal
    system_value: Decimal
    difference: Decimal
    plan_value: Decimal
    plan_status: str


class EmployeeReportRead(BaseModel):
    user_id: int
    bitrix_user_id: int
    full_name: str
    opened_app: bool
    submitted_data: bool
    metrics: list[ReportMetricRead]


class ReportRead(BaseModel):
    date_from: date
    date_to: date
    working_days: int
    employees: list[EmployeeReportRead]
