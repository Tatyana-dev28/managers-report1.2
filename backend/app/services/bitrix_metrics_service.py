from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Portal, User
from app.domain.roles import MANAGER
from app.integrations.bitrix import BitrixRestClient
from app.schemas.bitrix_metrics import (
    BitrixMetricsBatchCollectResponse,
    BitrixMetricsBatchError,
    BitrixMetricsBatchResult,
)
from app.services.report_assignee_service import get_report_assignee_users
from app.services.system_metrics_service import save_system_metrics_snapshot


def collect_and_save_bitrix_system_metrics(
    db: Session,
    bitrix_user_id: int,
    report_date: date,
) -> dict[str, Decimal]:
    client = BitrixRestClient()
    ensure_local_user_from_bitrix(
        db=db,
        client=client,
        bitrix_user_id=bitrix_user_id,
    )
    values = collect_bitrix_system_metrics(
        bitrix_user_id=bitrix_user_id,
        date_from=report_date,
        date_to=report_date,
        client=client,
    )
    save_system_metrics_snapshot(
        db=db,
        bitrix_user_id=bitrix_user_id,
        report_date=report_date,
        values=values,
    )
    return values


def collect_active_manager_system_metrics(
    db: Session,
    report_date: date,
) -> BitrixMetricsBatchCollectResponse:
    ensure_bitrix_metric_settings_ready()
    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        raise HTTPException(status_code=404, detail="Active portal not found")

    users = get_report_assignee_users(db, portal)

    collected: list[BitrixMetricsBatchResult] = []
    failed: list[BitrixMetricsBatchError] = []

    for user in users:
        try:
            collect_and_save_bitrix_system_metrics(
                db=db,
                bitrix_user_id=user.bitrix_user_id,
                report_date=report_date,
            )
            collected.append(
                BitrixMetricsBatchResult(
                    bitrix_user_id=user.bitrix_user_id,
                    full_name=get_user_full_name(user),
                )
            )
        except Exception as error:
            db.rollback()
            failed.append(
                BitrixMetricsBatchError(
                    bitrix_user_id=user.bitrix_user_id,
                    full_name=get_user_full_name(user),
                    error=str(error),
                )
            )

    return BitrixMetricsBatchCollectResponse(
        report_date=report_date,
        collected_count=len(collected),
        failed_count=len(failed),
        collected=collected,
        failed=failed,
    )


def collect_bitrix_system_metrics(
    bitrix_user_id: int,
    date_from: date,
    date_to: date,
    client: BitrixRestClient | None = None,
) -> dict[str, Decimal]:
    settings = get_settings()
    client = client or BitrixRestClient()
    period_start, period_end = get_period_bounds(date_from, date_to)

    calls = get_call_rows(client, bitrix_user_id, period_start, period_end)
    deals = get_deal_rows(client, bitrix_user_id, period_start, period_end)
    meeting_rows = get_smart_process_rows(
        client=client,
        entity_type_id=settings.bitrix_meeting_entity_type_id,
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    held_meeting_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=settings.bitrix_meeting_entity_type_id,
        stage_ids=split_csv(settings.bitrix_meeting_held_stage_ids),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    sent_contract_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=settings.bitrix_contract_entity_type_id,
        stage_ids=optional_set(settings.bitrix_contract_sent_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    signed_contract_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=settings.bitrix_contract_entity_type_id,
        stage_ids=optional_set(settings.bitrix_contract_signed_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    sent_invoice_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=settings.bitrix_invoice_entity_type_id,
        stage_ids=optional_set(settings.bitrix_invoice_sent_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    paid_invoice_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=settings.bitrix_invoice_entity_type_id,
        stage_ids=optional_set(settings.bitrix_invoice_paid_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    successful_deal_ids = get_stage_owner_ids_for_user(
        client=client,
        entity_type_id=2,
        stage_ids=optional_set(settings.bitrix_sale_success_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
        category_id=settings.bitrix_sale_deal_category_id,
    )
    paid_invoice_rows = get_items_by_ids(
        client=client,
        entity_type_id=settings.bitrix_invoice_entity_type_id,
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
        "commercial_offers_sent": Decimal(count_deals_by_category(deals, settings.bitrix_cold_base_deal_category_id)),
        "contracts_sent": Decimal(len(sent_contract_ids)),
        "contracts_signed": Decimal(len(signed_contract_ids)),
        "invoices_sent": Decimal(len(sent_invoice_ids)),
        "invoices_paid": Decimal(len(paid_invoice_ids)),
        "new_deals": Decimal(len(deals)),
        "successful_sale_deals": Decimal(len(successful_deal_ids)),
        "paid_invoice_sum": sum_money(paid_invoice_rows),
    }


def collect_bitrix_metric_debug_details(
    bitrix_user_id: int,
    report_date: date,
) -> dict[str, Any]:
    settings = get_settings()
    client = BitrixRestClient()
    period_start, period_end = get_period_bounds(report_date, report_date)

    calls = get_call_rows(client, bitrix_user_id, period_start, period_end)
    deals = get_deal_rows(client, bitrix_user_id, period_start, period_end)
    cold_base_deals = [
        row
        for row in deals
        if as_int(row.get("categoryId")) == settings.bitrix_cold_base_deal_category_id
    ]
    meeting_rows = get_smart_process_rows(
        client=client,
        entity_type_id=settings.bitrix_meeting_entity_type_id,
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    held_meetings = get_stage_items_debug(
        client=client,
        entity_type_id=settings.bitrix_meeting_entity_type_id,
        stage_ids=split_csv(settings.bitrix_meeting_held_stage_ids),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    sent_contracts = get_stage_items_debug(
        client=client,
        entity_type_id=settings.bitrix_contract_entity_type_id,
        stage_ids=optional_set(settings.bitrix_contract_sent_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    signed_contracts = get_stage_items_debug(
        client=client,
        entity_type_id=settings.bitrix_contract_entity_type_id,
        stage_ids=optional_set(settings.bitrix_contract_signed_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    sent_invoices = get_stage_items_debug(
        client=client,
        entity_type_id=settings.bitrix_invoice_entity_type_id,
        stage_ids=optional_set(settings.bitrix_invoice_sent_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    paid_invoices = get_stage_items_debug(
        client=client,
        entity_type_id=settings.bitrix_invoice_entity_type_id,
        stage_ids=optional_set(settings.bitrix_invoice_paid_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
    )
    successful_deals = get_stage_items_debug(
        client=client,
        entity_type_id=2,
        stage_ids=optional_set(settings.bitrix_sale_success_stage_id),
        bitrix_user_id=bitrix_user_id,
        period_start=period_start,
        period_end=period_end,
        category_id=settings.bitrix_sale_deal_category_id,
    )
    summary = collect_bitrix_system_metrics(
        bitrix_user_id=bitrix_user_id,
        date_from=report_date,
        date_to=report_date,
        client=client,
    )

    return {
        "period_start": bitrix_datetime(period_start),
        "period_end": bitrix_datetime(period_end),
        "summary": {metric_code: str(value) for metric_code, value in summary.items()},
        "details": {
            "calls": {
                "count": len(calls),
                "outgoing_count": count_calls(calls, call_types={"1"}),
                "successful_outgoing_count": count_successful_outgoing_calls(calls),
                "incoming_count": count_calls(calls, call_types={"2", "3"}),
                "items": limit_debug_items(calls, serialize_call_debug),
            },
            "new_deals": {
                "count": len(deals),
                "items": limit_debug_items(deals, serialize_crm_item_debug),
            },
            "commercial_offers_sent": {
                "source": "Created deals in cold base category",
                "category_id": settings.bitrix_cold_base_deal_category_id,
                "count": len(cold_base_deals),
                "items": limit_debug_items(cold_base_deals, serialize_crm_item_debug),
            },
            "meetings_created": {
                "count": len(meeting_rows),
                "items": limit_debug_items(meeting_rows, serialize_crm_item_debug),
            },
            "meetings_held": public_stage_debug(held_meetings),
            "contracts_sent": public_stage_debug(sent_contracts),
            "contracts_signed": public_stage_debug(signed_contracts),
            "invoices_sent": public_stage_debug(sent_invoices),
            "invoices_paid": public_stage_debug(paid_invoices),
            "successful_sale_deals": public_stage_debug(successful_deals),
            "paid_invoice_sum": {
                "counted_from": "invoices_paid.items",
                "value": str(sum_money(paid_invoices["items_raw"])),
            },
        },
    }


def get_stage_items_debug(
    client: BitrixRestClient,
    entity_type_id: int | None,
    stage_ids: set[str],
    bitrix_user_id: int,
    period_start: datetime,
    period_end: datetime,
    category_id: int | None = None,
) -> dict[str, Any]:
    if entity_type_id is None or not stage_ids:
        return {
            "stage_ids": sorted(stage_ids),
            "history_count": 0,
            "owner_ids": [],
            "count": 0,
            "history": [],
            "items": [],
            "items_raw": [],
        }

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
    item_rows = get_items_by_ids(
        client=client,
        entity_type_id=entity_type_id,
        owner_ids=owner_ids,
        bitrix_user_id=bitrix_user_id,
        category_id=category_id,
    )

    return {
        "stage_ids": sorted(stage_ids),
        "history_count": len(history_rows),
        "owner_ids": sorted(owner_ids),
        "count": len(item_rows),
        "history": limit_debug_items(history_rows, serialize_stage_history_debug),
        "items": limit_debug_items(item_rows, serialize_crm_item_debug),
        "items_raw": item_rows,
    }


def public_stage_debug(debug_details: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in debug_details.items()
        if key != "items_raw"
    }


def ensure_local_user_from_bitrix(
    db: Session,
    client: BitrixRestClient,
    bitrix_user_id: int,
) -> User:
    portal = db.scalar(select(Portal).where(Portal.is_active.is_(True)))
    if portal is None:
        raise HTTPException(status_code=404, detail="Active portal not found")

    user = db.scalar(
        select(User).where(
            User.portal_id == portal.id,
            User.bitrix_user_id == bitrix_user_id,
        )
    )
    if user is not None:
        return user

    bitrix_users = client.list_all("user.get", {"ID": bitrix_user_id})
    bitrix_user = bitrix_users[0] if bitrix_users else None
    if bitrix_user is None:
        raise HTTPException(status_code=404, detail="Bitrix user not found")

    user = User(
        portal_id=portal.id,
        bitrix_user_id=bitrix_user_id,
        first_name=as_optional_str(bitrix_user.get("NAME")),
        last_name=as_optional_str(bitrix_user.get("LAST_NAME")),
        role=MANAGER,
        is_active=bool(bitrix_user.get("ACTIVE", True)),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


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

    return client.list_all(
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


def split_csv(value: str) -> set[str]:
    return {item.strip() for item in value.split(",") if item.strip()}


def as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def as_optional_str(value: Any) -> str | None:
    return None if value is None else str(value)


def get_user_full_name(user: User) -> str:
    return " ".join(part for part in (user.first_name, user.last_name) if part) or str(user.bitrix_user_id)


def limit_debug_items(
    rows: list[dict[str, Any]],
    serializer,
    limit: int = 100,
) -> list[dict[str, Any]]:
    return [serializer(row) for row in rows[:limit]]


def serialize_call_debug(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": first_present(row, "ID", "CALL_ID"),
        "date": first_present(row, "CALL_START_DATE"),
        "call_type": first_present(row, "CALL_TYPE"),
        "duration_seconds": as_int(first_present(row, "CALL_DURATION")),
        "failed_code": first_present(row, "CALL_FAILED_CODE"),
        "portal_user_id": as_int(first_present(row, "PORTAL_USER_ID")),
        "crm_activity_id": first_present(row, "CRM_ACTIVITY_ID"),
    }


def serialize_crm_item_debug(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": as_int(first_present(row, "id", "ID")),
        "title": first_present(row, "title", "TITLE"),
        "assigned_by_id": as_int(first_present(row, "assignedById", "ASSIGNED_BY_ID")),
        "created_by_id": as_int(first_present(row, "createdBy", "CREATED_BY")),
        "category_id": as_int(first_present(row, "categoryId", "CATEGORY_ID")),
        "stage_id": first_present(row, "stageId", "STAGE_ID"),
        "created_time": first_present(row, "createdTime", "CREATED_TIME"),
        "opportunity": first_present(row, "opportunity", "OPPORTUNITY"),
    }


def serialize_stage_history_debug(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "history_id": as_int(first_present(row, "ID", "id")),
        "owner_id": as_int(first_present(row, "OWNER_ID", "ownerId")),
        "stage_id": first_present(row, "STAGE_ID", "stageId"),
        "category_id": as_int(first_present(row, "CATEGORY_ID", "categoryId")),
        "created_time": first_present(row, "CREATED_TIME", "createdTime"),
    }


def first_present(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row:
            return row[key]
    return None


def ensure_bitrix_metric_settings_ready() -> None:
    settings = get_settings()
    missing = []
    if not settings.bitrix_webhook_url:
        missing.append("BITRIX_WEBHOOK_URL")
    if settings.bitrix_meeting_entity_type_id is None:
        missing.append("BITRIX_MEETING_ENTITY_TYPE_ID")
    if settings.bitrix_contract_entity_type_id is None:
        missing.append("BITRIX_CONTRACT_ENTITY_TYPE_ID")
    if settings.bitrix_cold_base_deal_category_id is None:
        missing.append("BITRIX_COLD_BASE_DEAL_CATEGORY_ID")
    if settings.bitrix_sale_deal_category_id is None:
        missing.append("BITRIX_SALE_DEAL_CATEGORY_ID")
    if not settings.bitrix_sale_success_stage_id:
        missing.append("BITRIX_SALE_SUCCESS_STAGE_ID")
    if not settings.bitrix_invoice_paid_stage_id:
        missing.append("BITRIX_INVOICE_PAID_STAGE_ID")

    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Bitrix metric settings are not configured: {', '.join(missing)}",
        )
