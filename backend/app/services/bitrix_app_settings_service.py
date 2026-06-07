from typing import Any

from fastapi import HTTPException

from app.integrations.bitrix import BitrixRestClient
from app.schemas.bitrix_stateless import (
    BitrixAuthPayload,
    BitrixCategoryRead,
    BitrixCrmTypeRead,
    BitrixMetricSettings,
    BitrixStageRead,
)
from app.services.bitrix_stateless_service import build_client


DEAL_ENTITY_TYPE_ID = 2
INVOICE_ENTITY_TYPE_ID = 31
DEFAULT_INVOICE_CATEGORY_ID = 1
SETTINGS_OPTION_NAME = "manager_report_metric_settings"


def get_saved_metric_settings(auth: BitrixAuthPayload) -> BitrixMetricSettings | None:
    client = build_client(auth)
    payload = client.call("app.option.get", {"option": SETTINGS_OPTION_NAME})
    raw_value = payload.get("result")
    if raw_value is None:
        return None

    if isinstance(raw_value, dict):
        raw_value = raw_value.get(SETTINGS_OPTION_NAME) or raw_value.get("value")

    if not raw_value:
        return None

    try:
        return BitrixMetricSettings.model_validate_json(str(raw_value))
    except ValueError as error:
        raise HTTPException(
            status_code=502,
            detail="Bitrix24 returned invalid metric settings.",
        ) from error


def save_metric_settings(
    auth: BitrixAuthPayload,
    metric_settings: BitrixMetricSettings,
) -> BitrixMetricSettings:
    client = build_client(auth)
    client.call(
        "app.option.set",
        {
            "options": {
                SETTINGS_OPTION_NAME: metric_settings.model_dump_json(),
            },
        },
    )
    return metric_settings


def get_crm_types(auth: BitrixAuthPayload) -> list[BitrixCrmTypeRead]:
    client = build_client(auth)
    rows = client.list_all("crm.type.list")
    return [serialize_crm_type(row) for row in rows]


def get_categories(auth: BitrixAuthPayload, entity_type_id: int) -> list[BitrixCategoryRead]:
    client = build_client(auth)
    rows = client.list_all(
        "crm.category.list",
        {"entityTypeId": entity_type_id},
    )
    return [
        BitrixCategoryRead(
            id=int(first_present(row, "id", "ID")),
            entity_type_id=entity_type_id,
            name=str(first_present(row, "name", "NAME") or ""),
            sort=as_optional_int(first_present(row, "sort", "SORT")),
        )
        for row in rows
    ]


def get_stages(
    auth: BitrixAuthPayload,
    entity_type_id: int,
    category_id: int = 0,
) -> list[BitrixStageRead]:
    client = build_client(auth)
    resolved_category_id = resolve_stage_category_id(client, entity_type_id, category_id)
    entity_id = get_stage_entity_id(entity_type_id, resolved_category_id)
    rows = client.list_all(
        "crm.status.list",
        {
            "filter": {
                "ENTITY_ID": entity_id,
            },
            "order": {
                "SORT": "ASC",
            },
        },
    )
    return [
        BitrixStageRead(
            status_id=str(first_present(row, "STATUS_ID", "statusId") or ""),
            name=str(first_present(row, "NAME", "name") or ""),
            sort=as_optional_int(first_present(row, "SORT", "sort")),
            entity_id=str(first_present(row, "ENTITY_ID", "entityId") or entity_id),
            semantics=optional_str(first_present(row, "SEMANTICS", "semantics")),
        )
        for row in rows
    ]


def serialize_crm_type(row: dict[str, Any]) -> BitrixCrmTypeRead:
    return BitrixCrmTypeRead(
        id=as_optional_int(first_present(row, "id", "ID")),
        entity_type_id=int(first_present(row, "entityTypeId", "ENTITY_TYPE_ID")),
        title=str(first_present(row, "title", "TITLE", "name") or ""),
        code=optional_str(first_present(row, "code", "CODE")),
    )


def get_stage_entity_id(entity_type_id: int, category_id: int = 0) -> str:
    if entity_type_id == DEAL_ENTITY_TYPE_ID:
        return "DEAL_STAGE" if category_id == 0 else f"DEAL_STAGE_{category_id}"

    if entity_type_id == INVOICE_ENTITY_TYPE_ID:
        return f"SMART_INVOICE_STAGE_{category_id}"

    return f"DYNAMIC_{entity_type_id}_STAGE_{category_id}"


def resolve_stage_category_id(
    client: BitrixRestClient,
    entity_type_id: int,
    category_id: int,
) -> int:
    if entity_type_id == DEAL_ENTITY_TYPE_ID or category_id != 0:
        return category_id

    if entity_type_id == INVOICE_ENTITY_TYPE_ID:
        return DEFAULT_INVOICE_CATEGORY_ID

    categories = client.list_all("crm.category.list", {"entityTypeId": entity_type_id})
    default_category = next(
        (
            category
            for category in categories
            if str(first_present(category, "isDefault", "IS_DEFAULT")).upper() == "Y"
        ),
        categories[0] if categories else None,
    )
    resolved_category_id = as_optional_int(
        first_present(default_category or {}, "id", "ID")
    )
    return resolved_category_id or category_id


def as_optional_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def optional_str(value: Any) -> str | None:
    return None if value is None else str(value)


def first_present(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row:
            return row[key]
    return None
