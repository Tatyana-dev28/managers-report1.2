import logging
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.integrations.bitrix import BitrixRestClient
from app.schemas.bitrix_stateless import BitrixMetricSettings

logger = logging.getLogger(__name__)


def collect_bitrix_system_metrics(
    bitrix_user_id: int,
    date_from: date,
    date_to: date,
    client: BitrixRestClient,
    metric_settings: BitrixMetricSettings,
) -> dict[str, Decimal]:
    period_start, period_end = get_period_bounds(date_from, date_to)

    calls = get_call_rows(client, bitrix_user_id, period_start, period_end)
    deals = get_deal_rows(client, bitrix_user_id, period_start, period_end)
    meeting_rows = get_smart_process_rows(
        client=client,
        entity_type_id=metric_settings.meeting_entity_type_id,
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    held_meeting_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=metric_settings.meeting_entity_type_id,
        stage_ids=set(metric_settings.meeting_held_stage_ids),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    sent_contract_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=metric_settings.contract_entity_type_id,
        stage_ids=optional_set(metric_settings.contract_sent_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    signed_contract_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=metric_settings.contract_entity_type_id,
        stage_ids=optional_set(metric_settings.contract_signed_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    sent_invoice_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=metric_settings.invoice_entity_type_id,
        stage_ids=optional_set(metric_settings.invoice_sent_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    paid_invoice_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=metric_settings.invoice_entity_type_id,
        stage_ids=optional_set(metric_settings.invoice_paid_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    successful_deal_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=2,
        stage_ids=optional_set(metric_settings.sale_success_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
        category_id=metric_settings.sale_deal_category_id,
    )
    paid_invoice_rows = get_items_by_ids(
        client=client,
        entity_type_id=metric_settings.invoice_entity_type_id,
        owner_ids=paid_invoice_ids,
        bitrix_user_id=bitrix_user_id,
    )

    return {
        "meetings_held": Decimal(len(held_meeting_ids)),
        "meetings_created": Decimal(len(meeting_rows)),
        "calls_total": Decimal(len(calls)),
        "outgoing_calls": Decimal(count_calls(calls, call_types={"1"})),
        "successful_outgoing_calls": Decimal(count_successful_outgoing_calls(calls)),
        "incoming_calls": Decimal(count_calls(calls, call_types={"2", "3"})),
        "commercial_offers_sent": Decimal(
            count_deals_by_category(deals, metric_settings.cold_base_deal_category_id)
        ),
        "contracts_sent": Decimal(len(sent_contract_ids)),
        "contracts_signed": Decimal(len(signed_contract_ids)),
        "invoices_sent": Decimal(len(sent_invoice_ids)),
        "invoices_paid": Decimal(len(paid_invoice_ids)),
        "new_deals": Decimal(len(deals)),
        "successful_sale_deals": Decimal(len(successful_deal_ids)),
        "paid_invoice_sum": sum_money(paid_invoice_rows),
    }


def get_period_bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    app_timezone = ZoneInfo(get_settings().timezone)
    period_start = datetime.combine(date_from, time.min, tzinfo=app_timezone)
    period_end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=app_timezone)
    return period_start, period_end


def bitrix_datetime(value: datetime) -> str:
    return value.isoformat()


def get_call_rows(
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
                ">=CALL_START_DATE": bitrix_datetime(period_start),
                "<CALL_START_DATE": bitrix_datetime(period_end),
            },
            "SORT": "CALL_START_DATE",
            "ORDER": "ASC",
        },
    )


def get_deal_rows(
    client: BitrixRestClient,
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> list[dict[str, Any]]:
    return client.list_all(
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
                ">=createdTime": bitrix_datetime(period_start),
                "<createdTime": bitrix_datetime(period_end),
            },
        },
    )


def get_smart_process_rows(
    client: BitrixRestClient,
    entity_type_id: int | None,
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> list[dict[str, Any]]:
    if entity_type_id is None:
        return []

    return client.list_all(
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
                "opportunity",
            ],
            "filter": {
                "assignedById": bitrix_user_id,
                ">=createdTime": bitrix_datetime(period_start),
                "<createdTime": bitrix_datetime(period_end),
            },
        },
    )


def get_stage_history_rows(
    client: BitrixRestClient,
    entity_type_id: int,
    stage_ids: set[str],
    period_start: datetime,
    period_end: datetime,
) -> list[dict[str, Any]]:
    if not stage_ids:
        return []

    logger.info(f"=== STAGE HISTORY REQUEST: entityTypeId={entity_type_id}, stage_ids={stage_ids} ===")
    result = client.list_all(
        "crm.stagehistory.list",
        {
            "entityTypeId": entity_type_id,
            "order": {"ID": "ASC"},
            "filter": {
                "@STAGE_ID": list(stage_ids),
                ">=CREATED_TIME": bitrix_datetime(period_start),
                "<CREATED_TIME": bitrix_datetime(period_end),
            },
            "select": ["ID", "OWNER_ID", "STAGE_ID", "CATEGORY_ID", "CREATED_TIME"],
        },
    )
    logger.info(f"=== STAGE HISTORY RESULT: {len(result)} rows ===")
    if result:
        logger.info(f"=== STAGE HISTORY FIRST ROW: {result[0]} ===")
    return result


def get_stage_owner_ids_for_user(
    client: BitrixRestClient,
    entity_type_id: int | None,
    stage_ids: set[str],
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    category_id: int | None = None,
) -> set[int]:
    if entity_type_id is None or not stage_ids:
        return set()

    history_rows = get_stage_history_rows(
        client=client,
        entity_type_id=entity_type_id,
        stage_ids=stage_ids,
        period_start=period_start,
        period_end=period_end,
    )
    owner_ids = {
        owner_id
        for owner_id in (as_int(row.get("OWNER_ID")) for row in history_rows)
        if owner_id is not None
    }
    if not owner_ids:
        return set()

    assigned_rows = get_items_by_ids(
        client=client,
        entity_type_id=entity_type_id,
        owner_ids=owner_ids,
        bitrix_user_id=bitrix_user_id,
        category_id=category_id,
    )
    return {
        owner_id
        for owner_id in (as_int(row.get("id")) for row in assigned_rows)
        if owner_id is not None
    }


def get_items_by_ids(
    client: BitrixRestClient,
    entity_type_id: int,
    owner_ids: set[int],
    bitrix_user_id: int,
    category_id: int | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    ids = list(owner_ids)

    for start in range(0, len(ids), 50):
        chunk = ids[start : start + 50]
        item_filter: dict[str, Any] = {
            "@id": chunk,
            "assignedById": bitrix_user_id,
        }
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

    return rows


def count_calls(rows: list[dict[str, Any]], call_types: set[str]) -> int:
    return sum(1 for row in rows if str(row.get("CALL_TYPE")) in call_types)


def count_successful_outgoing_calls(rows: list[dict[str, Any]]) -> int:
    total = 0
    for row in rows:
        duration = int(row.get("CALL_DURATION") or 0)
        failed_code = str(row.get("CALL_FAILED_CODE") or "")
        if str(row.get("CALL_TYPE")) == "1" and duration > 10 and failed_code in {"", "200"}:
            total += 1
    return total


def count_deals_by_category(rows: list[dict[str, Any]], category_id: int | None) -> int:
    if category_id is None:
        return 0
    return sum(1 for row in rows if as_int(row.get("categoryId")) == category_id)


def sum_money(rows: list[dict[str, Any]]) -> Decimal:
    total = Decimal("0.00")
    for row in rows:
        total += Decimal(str(row.get("opportunity") or "0"))
    return total


def optional_set(value: str | None) -> set[str]:
    return {value} if value else set()


def as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
