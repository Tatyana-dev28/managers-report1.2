from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException

from app.domain.metrics import METRICS
from app.integrations.bitrix import BitrixRestClient
from app.schemas.bitrix_stateless import (
    BitrixAuthPayload,
    BitrixEmployeeSystemReportRead,
    BitrixMetricSettings,
    BitrixSystemMetricRead,
    BitrixSystemReportRead,
    BitrixUserRead,
)
from app.services.bitrix_system_metrics import collect_bitrix_system_metrics


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


def build_system_report(
    auth: BitrixAuthPayload,
    date_from: date,
    date_to: date,
    bitrix_user_ids: list[int],
    metric_settings: BitrixMetricSettings,
) -> BitrixSystemReportRead:
    if date_to < date_from:
        raise HTTPException(
            status_code=422,
            detail="date_to must be greater than or equal to date_from",
        )

    ensure_metric_settings_ready(metric_settings)
    if not bitrix_user_ids:
        return BitrixSystemReportRead(
            date_from=date_from,
            date_to=date_to,
            employees=[],
        )

    client = build_client(auth)
    users_by_id = {
        user.bitrix_user_id: user
        for user in get_bitrix_users(auth)
    }

    employees: list[BitrixEmployeeSystemReportRead] = []
    for bitrix_user_id in bitrix_user_ids:
        values = collect_bitrix_system_metrics(
            bitrix_user_id=bitrix_user_id,
            date_from=date_from,
            date_to=date_to,
            client=client,
            metric_settings=metric_settings,
        )
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


def ensure_metric_settings_ready(settings: BitrixMetricSettings) -> None:
    required_values = {
        "meeting_entity_type_id": settings.meeting_entity_type_id,
        "contract_entity_type_id": settings.contract_entity_type_id,
        "cold_base_deal_category_id": settings.cold_base_deal_category_id,
        "sale_deal_category_id": settings.sale_deal_category_id,
        "sale_success_stage_id": settings.sale_success_stage_id,
        "meeting_held_stage_ids": settings.meeting_held_stage_ids,
        "contract_sent_stage_id": settings.contract_sent_stage_id,
        "contract_signed_stage_id": settings.contract_signed_stage_id,
        "invoice_sent_stage_id": settings.invoice_sent_stage_id,
        "invoice_paid_stage_id": settings.invoice_paid_stage_id,
    }
    missing = [name for name, value in required_values.items() if value is None or value == "" or value == []]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Не заполнены настройки источников показателей: {', '.join(missing)}",
        )
    BitrixMetricSettings,
