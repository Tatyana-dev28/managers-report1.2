from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class PlanValueInput(BaseModel):
    bitrix_user_id: int
    metric_code: str
    plan_year: int = Field(ge=2000)
    plan_month: int = Field(ge=1, le=12)
    daily_value: Decimal = Field(ge=0)
    monthly_value: Decimal = Field(ge=0)


class PlansSaveRequest(BaseModel):
    created_by_bitrix_user_id: int
    plans: list[PlanValueInput]


class PlanRead(BaseModel):
    bitrix_user_id: int
    metric_code: str
    plan_year: int
    plan_month: int
    daily_value: Decimal
    monthly_value: Decimal


class PlanPeriodPreview(BaseModel):
    date_from: date
    date_to: date
    working_days: int
