from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.bitrix_metrics import (
    BitrixMetricsBatchCollectRequest,
    BitrixMetricsBatchCollectResponse,
    BitrixMetricsCollectRequest,
    BitrixMetricsCollectResponse,
    BitrixMetricsDebugResponse,
    build_collect_response,
)
from app.services.bitrix_metrics_service import (
    collect_active_manager_system_metrics,
    collect_and_save_bitrix_system_metrics,
    collect_bitrix_metric_debug_details,
    ensure_bitrix_metric_settings_ready,
)
from app.services.date_service import get_today


router = APIRouter(prefix="/bitrix-metrics", tags=["bitrix-metrics"])


@router.post("/collect", response_model=BitrixMetricsCollectResponse)
def collect_bitrix_metrics(
    payload: BitrixMetricsCollectRequest,
    db: Session = Depends(get_db),
) -> BitrixMetricsCollectResponse:
    ensure_bitrix_metric_settings_ready()
    values = collect_and_save_bitrix_system_metrics(
        db=db,
        bitrix_user_id=payload.bitrix_user_id,
        report_date=payload.report_date,
    )
    return build_collect_response(
        bitrix_user_id=payload.bitrix_user_id,
        report_date=payload.report_date,
        values=values,
    )


@router.post("/collect-active", response_model=BitrixMetricsBatchCollectResponse)
def collect_active_bitrix_metrics(
    payload: BitrixMetricsBatchCollectRequest = Body(default_factory=BitrixMetricsBatchCollectRequest),
    db: Session = Depends(get_db),
) -> BitrixMetricsBatchCollectResponse:
    ensure_bitrix_metric_settings_ready()
    return collect_active_manager_system_metrics(
        db=db,
        report_date=payload.report_date or get_today(),
    )


@router.post("/debug", response_model=BitrixMetricsDebugResponse)
def debug_bitrix_metrics(
    payload: BitrixMetricsCollectRequest,
) -> BitrixMetricsDebugResponse:
    ensure_bitrix_metric_settings_ready()
    return BitrixMetricsDebugResponse(
        bitrix_user_id=payload.bitrix_user_id,
        report_date=payload.report_date,
        **collect_bitrix_metric_debug_details(
            bitrix_user_id=payload.bitrix_user_id,
            report_date=payload.report_date,
        ),
    )
