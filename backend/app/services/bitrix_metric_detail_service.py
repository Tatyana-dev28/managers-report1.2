import logging
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.integrations.bitrix import BitrixRestClient
from app.schemas.bitrix_stateless import BitrixMetricSettings

logger = logging.getLogger(__name__)


def get_metric_detail(
    bitrix_user_id: int,
    metric_code: str,
    date_from: date,
    date_to: date,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    """Возвращает список записей-источников для указанной метрики.

    Каждая запись — это словарь с ключами, специфичными для метрики.
    """
    period_start, period_end = _get_period_bounds(date_from, date_to)

    logger.info(
        f"[MetricDetail] metric={metric_code}, user_id={bitrix_user_id}, "
        f"from={date_from}, to={date_to}"
    )

    dispatcher = _get_dispatcher()
    handler = dispatcher.get(metric_code)
    if handler is None:
        logger.warning(f"[MetricDetail] No handler for metric: {metric_code}")
        return []

    return handler(bitrix_user_id, period_start, period_end, client, metric_settings)


def _get_dispatcher() -> dict[str, Any]:
    """Возвращает словарь: metric_code -> handler function."""
    return {
        # Звонки
        "calls_total": _detail_calls_total,
        "outgoing_calls": _detail_outgoing_calls,
        "successful_outgoing_calls": _detail_successful_outgoing_calls,
        "incoming_calls": _detail_incoming_calls,
        # Встречи
        "meetings_held": _detail_meetings_held,
        "meetings_created": _detail_meetings_created,
        # Сделки
        "new_deals": _detail_new_deals,
        "commercial_offers_sent": _detail_commercial_offers_sent,
        "successful_sale_deals": _detail_successful_sale_deals,
        # Договоры
        "contracts_sent": _detail_contracts_sent,
        "contracts_signed": _detail_contracts_signed,
        # Счета
        "invoices_sent": _detail_invoices_sent,
        "invoices_paid": _detail_invoices_paid,
        "paid_invoice_sum": _detail_invoices_paid,
    }


# ============================================================
# Звонки
# ============================================================


def _get_call_rows(
    client: BitrixRestClient,
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> list[dict[str, Any]]:
    return client.list_all(
        "voximplant.statistic.get",
        {
            "FILTER": {
                "PORTAL_USER_ID": bitrix_user_id,
                ">=CALL_START_DATE": _bitrix_dt(period_start),
                "<CALL_START_DATE": _bitrix_dt(period_end),
            },
            "SORT": "CALL_START_DATE",
            "ORDER": "DESC",
        },
    )


def _detail_calls_total(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    return _get_call_rows(client, bitrix_user_id, period_start, period_end)


def _detail_outgoing_calls(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    rows = _get_call_rows(client, bitrix_user_id, period_start, period_end)
    return [r for r in rows if str(r.get("CALL_TYPE")) == "1"]


def _detail_successful_outgoing_calls(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    rows = _get_call_rows(client, bitrix_user_id, period_start, period_end)
    return [
        r
        for r in rows
        if _is_successful_outgoing(r)
    ]


def _is_successful_outgoing(row: dict[str, Any]) -> bool:
    if str(row.get("CALL_TYPE")) != "1":
        return False
    duration = int(row.get("CALL_DURATION") or 0)
    failed_code = str(row.get("CALL_FAILED_CODE") or "")
    return duration > 10 and failed_code in {"", "200"}


def _detail_incoming_calls(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    rows = _get_call_rows(client, bitrix_user_id, period_start, period_end)
    return [r for r in rows if str(r.get("CALL_TYPE")) in {"2", "3"}]


# ============================================================
# Встречи (Смарт-процесс)
# ============================================================


def _get_meeting_rows(
    client: BitrixRestClient,
    entity_type_id: int | None,
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> list[dict[str, Any]]:
    if entity_type_id is None:
        return []
    rows = client.list_all(
        "crm.item.list",
        {
            "entityTypeId": entity_type_id,
            "select": [
                "id",
                "title",
                "assignedById",
                "createdBy",
                "stageId",
                "createdTime",
                "updatedTime",
            ],
            "filter": {
                "assignedById": bitrix_user_id,
                ">=createdTime": _bitrix_dt(period_start),
                "<createdTime": _bitrix_dt(period_end),
            },
            "order": {"createdTime": "DESC"},
        },
    )

    # Подменяем stageId на название стадии
    if rows:
        stage_map = _get_stage_name_map(client, entity_type_id)
        rows = _enrich_items_with_stage_names(rows, stage_map)

    return rows


def _detail_meetings_created(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    return _get_meeting_rows(
        client, metric_settings.meeting_entity_type_id,
        bitrix_user_id, period_start, period_end,
    )


def _detail_meetings_held(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    entity_type_id = metric_settings.meeting_entity_type_id
    if entity_type_id is None:
        return []

    # Получаем ID элементов, которые перешли в стадию "проведена"
    held_ids = _get_stage_owner_ids(
        client=client,
        entity_type_id=entity_type_id,
        stage_ids=set(metric_settings.meeting_held_stage_ids),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    if not held_ids:
        return []

    return _get_items_by_ids(
        client=client,
        entity_type_id=entity_type_id,
        owner_ids=held_ids,
        bitrix_user_id=bitrix_user_id,
    )


# ============================================================
# Сделки
# ============================================================


def _get_deal_rows(
    client: BitrixRestClient,
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> list[dict[str, Any]]:
    rows = client.list_all(
        "crm.item.list",
        {
            "entityTypeId": 2,
            "select": [
                "id",
                "title",
                "assignedById",
                "categoryId",
                "stageId",
                "createdTime",
                "opportunity",
            ],
            "filter": {
                "assignedById": bitrix_user_id,
                ">=createdTime": _bitrix_dt(period_start),
                "<createdTime": _bitrix_dt(period_end),
            },
            "order": {"createdTime": "DESC"},
        },
    )

    # Подменяем stageId на название стадии
    if rows:
        stage_map = _get_stage_name_map(client, 2)
        rows = _enrich_items_with_stage_names(rows, stage_map)

    return rows


def _detail_new_deals(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    return _get_deal_rows(client, bitrix_user_id, period_start, period_end)


def _detail_commercial_offers_sent(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    category_id = metric_settings.cold_base_deal_category_id
    if category_id is None:
        return []
    rows = _get_deal_rows(client, bitrix_user_id, period_start, period_end)
    return [r for r in rows if _as_int(r.get("categoryId")) == category_id]


def _detail_successful_sale_deals(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    stage_ids = _optional_set(metric_settings.sale_success_stage_id)
    if not stage_ids:
        return []

    deal_ids = _get_stage_owner_ids(
        client=client,
        entity_type_id=2,
        stage_ids=stage_ids,
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
        category_id=metric_settings.sale_deal_category_id,
        skip_assigned_filter=True,
    )
    if not deal_ids:
        return []

    return _get_items_by_ids(
        client=client,
        entity_type_id=2,
        owner_ids=deal_ids,
        bitrix_user_id=None,
    )


# ============================================================
# Договоры (Смарт-процесс)
# ============================================================


def _get_contract_rows_by_stage(
    client: BitrixRestClient,
    entity_type_id: int | None,
    stage_ids: set[str],
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    skip_assigned_filter: bool = False,
) -> list[dict[str, Any]]:
    if entity_type_id is None or not stage_ids:
        return []

    owner_ids = _get_stage_owner_ids(
        client=client,
        entity_type_id=entity_type_id,
        stage_ids=stage_ids,
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
        skip_assigned_filter=skip_assigned_filter,
    )
    if not owner_ids:
        return []

    return _get_items_by_ids(
        client=client,
        entity_type_id=entity_type_id,
        owner_ids=owner_ids,
        bitrix_user_id=None if skip_assigned_filter else bitrix_user_id,
    )


def _detail_contracts_sent(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    return _get_contract_rows_by_stage(
        client=client,
        entity_type_id=metric_settings.contract_entity_type_id,
        stage_ids=_optional_set(metric_settings.contract_sent_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )


def _detail_contracts_signed(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    return _get_contract_rows_by_stage(
        client=client,
        entity_type_id=metric_settings.contract_entity_type_id,
        stage_ids=_optional_set(metric_settings.contract_signed_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
        skip_assigned_filter=True,
    )


# ============================================================
# Счета (Смарт-процесс)
# ============================================================


def _get_invoice_rows_by_stage(
    client: BitrixRestClient,
    stage_ids: set[str],
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    skip_assigned_filter: bool = False,
) -> list[dict[str, Any]]:
    entity_type_id = 31  # SMART_INVOICE
    if not stage_ids:
        return []

    owner_ids = _get_stage_owner_ids(
        client=client,
        entity_type_id=entity_type_id,
        stage_ids=stage_ids,
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
        skip_assigned_filter=skip_assigned_filter,
    )
    if not owner_ids:
        return []

    return _get_items_by_ids(
        client=client,
        entity_type_id=entity_type_id,
        owner_ids=owner_ids,
        bitrix_user_id=None if skip_assigned_filter else bitrix_user_id,
    )


def _detail_invoices_sent(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    return _get_invoice_rows_by_stage(
        client=client,
        stage_ids=_optional_set(metric_settings.invoice_sent_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )


def _detail_invoices_paid(
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> list[dict[str, Any]]:
    return _get_invoice_rows_by_stage(
        client=client,
        stage_ids=_optional_set(metric_settings.invoice_paid_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
        skip_assigned_filter=True,
    )


# ============================================================
# Общие утилиты (скопированы из bitrix_system_metrics.py)
# ============================================================


def _get_period_bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    app_timezone = ZoneInfo(get_settings().timezone)
    period_start = datetime.combine(date_from, time.min, tzinfo=app_timezone)
    period_end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=app_timezone)
    return period_start, period_end


def _bitrix_dt(value: datetime) -> str:
    return value.isoformat()


def _get_stage_owner_ids(
    client: BitrixRestClient,
    entity_type_id: int,
    stage_ids: set[str],
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    category_id: int | None = None,
    *,
    skip_assigned_filter: bool = False,
) -> set[int]:
    if not stage_ids:
        return set()

    history_rows = client.list_all(
        "crm.stagehistory.list",
        {
            "entityTypeId": entity_type_id,
            "order": {"ID": "ASC"},
            "filter": {
                "@STAGE_ID": list(stage_ids),
                ">=CREATED_TIME": _bitrix_dt(period_start),
                "<CREATED_TIME": _bitrix_dt(period_end),
            },
            "select": ["ID", "OWNER_ID", "STAGE_ID", "CATEGORY_ID", "CREATED_TIME"],
        },
    )
    owner_ids = {
        owner_id
        for owner_id in (_as_int(row.get("OWNER_ID")) for row in history_rows)
        if owner_id is not None
    }
    if not owner_ids:
        return set()

    if skip_assigned_filter:
        return owner_ids

    assigned_rows = _get_items_by_ids(
        client=client,
        entity_type_id=entity_type_id,
        owner_ids=owner_ids,
        bitrix_user_id=bitrix_user_id,
        category_id=category_id,
    )
    return {
        owner_id
        for owner_id in (_as_int(row.get("id")) for row in assigned_rows)
        if owner_id is not None
    }


def _get_stage_name_map(
    client: BitrixRestClient,
    entity_type_id: int,
    category_id: int | None = None,
) -> dict[str, str]:
    """Получает словарь {stageId: stageName} для указанного entity_type_id."""
    from app.services.bitrix_metric_sources_service import get_stage_entity_id

    if entity_type_id == 2:
        # Для сделок category_id может быть None — используем 0
        resolved_category = category_id if category_id is not None else 0
    else:
        resolved_category = category_id if category_id is not None else 0

    status_entity_id = get_stage_entity_id(entity_type_id, resolved_category)
    try:
        stages = client.list_all(
            "crm.status.list",
            {
                "filter": {"ENTITY_ID": status_entity_id},
                "order": {"SORT": "ASC"},
            },
        )
        return {
            stage.get("STATUS_ID", ""): stage.get("NAME", stage.get("STATUS_ID", ""))
            for stage in stages
        }
    except Exception:
        logger.warning(f"[MetricDetail] Failed to load stages for {status_entity_id}")
        return {}


def _enrich_items_with_stage_names(
    rows: list[dict[str, Any]],
    stage_name_map: dict[str, str],
) -> list[dict[str, Any]]:
    """Подменяет stageId на название стадии в каждой строке."""
    for row in rows:
        stage_id = row.get("stageId", "")
        if stage_id in stage_name_map:
            row["stageId"] = stage_name_map[stage_id]
    return rows


def _get_items_by_ids(
    client: BitrixRestClient,
    entity_type_id: int,
    owner_ids: set[int],
    bitrix_user_id: int | None,
    category_id: int | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    ids = list(owner_ids)

    for start in range(0, len(ids), 50):
        chunk = ids[start : start + 50]
        item_filter: dict[str, Any] = {
            "@id": chunk,
        }
        if bitrix_user_id is not None:
            item_filter["assignedById"] = bitrix_user_id
        if category_id is not None:
            item_filter["categoryId"] = category_id

        rows.extend(
            client.list_all(
                "crm.item.list",
                {
                    "entityTypeId": entity_type_id,
                    "select": [
                        "id",
                        "title",
                        "assignedById",
                        "categoryId",
                        "stageId",
                        "createdTime",
                        "opportunity",
                    ],
                    "filter": item_filter,
                },
            )
        )

    # Обогащаем строки названиями стадий
    if rows:
        stage_map = _get_stage_name_map(client, entity_type_id, category_id)
        rows = _enrich_items_with_stage_names(rows, stage_map)

    return rows


def _optional_set(value: str | None) -> set[str]:
    return {value} if value else set()


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None