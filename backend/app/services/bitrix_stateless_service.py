from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException

from app.domain.metrics import METRICS
from app.integrations.bitrix import BitrixRestClient
from app.schemas.bitrix_stateless import (
    BitrixAuthPayload,
    BitrixEmployeeSystemReportRead,
    BitrixMetricDetailRead,
    BitrixMetricDetailRow,
    BitrixMetricSettings,
    BitrixSystemMetricRead,
    BitrixSystemReportRead,
    BitrixUserRead,
)
from app.services.bitrix_metric_detail_service import get_metric_detail as _get_detail_rows
from app.services.bitrix_system_metrics import collect_bitrix_system_metrics
from app.services.bitrix_metric_sources_service import detect_metric_sources

MAX_CONCURRENT_WORKERS = 5


def build_client(auth: BitrixAuthPayload) -> BitrixRestClient:
    return BitrixRestClient(domain=auth.domain, access_token=auth.access_token)


def get_bitrix_users(auth: BitrixAuthPayload) -> list[BitrixUserRead]:
    client = build_client(auth)
    rows = client.list_all(
        "user.get",
        {
            "FILTER": {
                "ACTIVE": True,
                "USER_TYPE": "employee",
            },
        },
    )
    return [
        serialize_user(row)
        for row in rows
        if as_int(row.get("ID")) is not None
    ]


def convert_detected_to_settings(detected) -> BitrixMetricSettings:

    return BitrixMetricSettings(
        meeting_entity_type_id=detected.meeting_entity_type_id,
        contract_entity_type_id=detected.contract_entity_type_id,
        invoice_entity_type_id=detected.invoice_entity_type_id,
        cold_base_deal_category_id=detected.cold_base_deal_category_id,
        sale_deal_category_id=detected.sale_deal_category_id,
        sale_success_stage_id=detected.sale_success_stage_id,
        meeting_held_stage_ids=list(detected.meeting_held_stage_ids),
        contract_sent_stage_id=detected.contract_sent_stage_id,
        contract_signed_stage_id=detected.contract_signed_stage_id,
        invoice_sent_stage_id=detected.invoice_sent_stage_id,
        invoice_paid_stage_id=detected.invoice_paid_stage_id,
    )


def _collect_metrics_for_user(
    bitrix_user_id: int,
    date_from: date,
    date_to: date,
    auth: BitrixAuthPayload,
    metric_settings: BitrixMetricSettings,
) -> tuple[int, dict[str, Decimal]]:
    """Собирает метрики для одного сотрудника. Вызывается в отдельном потоке,
    поэтому создаёт свой экземпляр клиента (клиенты не потокобезопасны)."""
    client = build_client(auth)
    values = collect_bitrix_system_metrics(
        bitrix_user_id=bitrix_user_id,
        date_from=date_from,
        date_to=date_to,
        client=client,
        metric_settings=metric_settings,
    )
    return bitrix_user_id, values


def build_system_report(
    auth: BitrixAuthPayload,
    date_from: date,
    date_to: date,
    bitrix_user_ids: list[int],
    metric_settings: BitrixMetricSettings | None = None,
) -> BitrixSystemReportRead:
    if date_to < date_from:
        raise HTTPException(
            status_code=422,
            detail="date_to must be greater than or equal to date_from",
        )

    client = build_client(auth)
    
    if metric_settings is None:
        detected = detect_metric_sources(client)
        metric_settings = convert_detected_to_settings(detected)

    if not bitrix_user_ids:
        return BitrixSystemReportRead(
            date_from=date_from,
            date_to=date_to,
            employees=[],
        )

    users_by_id = {
        user.bitrix_user_id: user
        for user in get_bitrix_users(auth)
    }

    # Собираем метрики параллельно, не более MAX_CONCURRENT_WORKERS одновременно
    results: dict[int, dict[str, Decimal]] = {}
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_WORKERS) as executor:
        futures = {
            executor.submit(
                _collect_metrics_for_user,
                bitrix_user_id=uid,
                date_from=date_from,
                date_to=date_to,
                auth=auth,
                metric_settings=metric_settings,
            ): uid
            for uid in bitrix_user_ids
        }
        for future in as_completed(futures):
            uid = futures[future]
            try:
                user_id, values = future.result()
                results[user_id] = values
            except HTTPException:
                raise
            except Exception as error:
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to collect metrics for user {uid}: {error}",
                ) from error

    employees: list[BitrixEmployeeSystemReportRead] = []
    for bitrix_user_id in bitrix_user_ids:
        values = results.get(bitrix_user_id, {})
        user = users_by_id.get(bitrix_user_id)
        employees.append(
            BitrixEmployeeSystemReportRead(
                bitrix_user_id=bitrix_user_id,
                full_name=user.full_name if user else str(bitrix_user_id),
                metrics=[
                    BitrixSystemMetricRead(
                        metric_code=metric.code,
                        metric_title=metric.title,
                        is_money=metric.is_money,
                        system_value=format_metric_value(
                            values.get(metric.code, Decimal("0")),
                            metric.is_money,
                        ),
                    )
                    for metric in METRICS
                ],
            )
        )

    return BitrixSystemReportRead(
        date_from=date_from,
        date_to=date_to,
        employees=employees,
    )


def get_metric_detail(
    auth: BitrixAuthPayload,
    metric_code: str,
    employee_id: int,
    date_from: date,
    date_to: date,
    metric_settings: BitrixMetricSettings | None = None,
) -> BitrixMetricDetailRead:
    """Возвращает детализацию для указанной метрики."""
    client = build_client(auth)

    if metric_settings is None:
        detected = detect_metric_sources(client)
        metric_settings = convert_detected_to_settings(detected)

    # Находим название метрики
    metric_title = metric_code
    for m in METRICS:
        if m.code == metric_code:
            metric_title = m.title
            break

    rows = _get_detail_rows(
        bitrix_user_id=employee_id,
        metric_code=metric_code,
        date_from=date_from,
        date_to=date_to,
        client=client,
        metric_settings=metric_settings,
    )

    return BitrixMetricDetailRead(
        metric_code=metric_code,
        metric_title=metric_title,
        rows=[BitrixMetricDetailRow(columns=row) for row in rows],
    )


def serialize_user(row: dict[str, Any]) -> BitrixUserRead:
    bitrix_user_id = as_int(row.get("ID"))
    if bitrix_user_id is None:
        raise HTTPException(status_code=502, detail="Bitrix user response does not contain ID")

    first_name = as_optional_str(row.get("NAME"))
    last_name = as_optional_str(row.get("LAST_NAME"))
    full_name = " ".join(part for part in (first_name, last_name) if part) or str(bitrix_user_id)
    return BitrixUserRead(
        bitrix_user_id=bitrix_user_id,
        first_name=first_name,
        last_name=last_name,
        full_name=full_name,
    )


def format_metric_value(value: Decimal, is_money: bool) -> str:
    return f"{value:.2f}" if is_money else str(int(value))


def as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def as_optional_str(value: Any) -> str | None:
    return None if value is None else str(value)