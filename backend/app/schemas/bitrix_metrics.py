from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel

from app.schemas.submissions import MetricValueInput


class BitrixMetricsCollectRequest(BaseModel):
    bitrix_user_id: int
    report_date: date


class BitrixMetricsCollectResponse(BaseModel):
    bitrix_user_id: int
    report_date: date
    values: list[MetricValueInput]


class BitrixMetricsDebugResponse(BaseModel):
    bitrix_user_id: int
    report_date: date
    period_start: str
    period_end: str
    summary: dict[str, str]
    details: dict[str, Any]


class BitrixMetricsBatchResult(BaseModel):
    bitrix_user_id: int
    full_name: str


class BitrixMetricsBatchError(BaseModel):
    bitrix_user_id: int
    full_name: str
    error: str


class BitrixMetricsBatchCollectRequest(BaseModel):
    report_date: date | None = None


class BitrixMetricsBatchCollectResponse(BaseModel):
    report_date: date
    collected_count: int
    failed_count: int
    collected: list[BitrixMetricsBatchResult]
    failed: list[BitrixMetricsBatchError]


def build_collect_response(
    bitrix_user_id: int,
    report_date: date,
    values: dict[str, Decimal],
) -> BitrixMetricsCollectResponse:
    return BitrixMetricsCollectResponse(
        bitrix_user_id=bitrix_user_id,
        report_date=report_date,
        values=[
            MetricValueInput(metric_code=metric_code, value=value)
            for metric_code, value in values.items()
        ],
    )
