from fastapi import APIRouter

from app.domain.metrics import METRICS
from app.schemas.metrics import MetricRead


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=list[MetricRead])
def get_metrics() -> list[MetricRead]:
    return [
        MetricRead(code=metric.code, title=metric.title, is_money=metric.is_money)
        for metric in METRICS
    ]
