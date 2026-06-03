from typing import Any

from fastapi import HTTPException

from app.integrations.bitrix import BitrixRestClient
from app.schemas.bitrix_settings import (
    BitrixCategoryRead,
    BitrixConnectionCheck,
    BitrixCrmTypeRead,
    BitrixFieldRead,
    BitrixStageRead,
)


DEAL_ENTITY_TYPE_ID = 2
INVOICE_ENTITY_TYPE_ID = 31
DEFAULT_INVOICE_CATEGORY_ID = 1


def check_bitrix_connection() -> BitrixConnectionCheck:
    client = BitrixRestClient()
    payload = client.call("user.current")
    result = payload.get("result", {})
    user_name = " ".join(
        part for part in (result.get("NAME"), result.get("LAST_NAME")) if part
    )
    return BitrixConnectionCheck(
        ok=True,
        message=f"Connection ok: {user_name or result.get('ID') or 'Bitrix24'}",
    )


def get_crm_types() -> list[BitrixCrmTypeRead]:
    client = BitrixRestClient()
    rows = client.list_all("crm.type.list")
    return [serialize_crm_type(row) for row in rows]


def get_categories(entity_type_id: int) -> list[BitrixCategoryRead]:
    client = BitrixRestClient()
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


def get_stages(entity_type_id: int, category_id: int = 0) -> list[BitrixStageRead]:
    client = BitrixRestClient()
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


def get_fields(entity_type_id: int) -> list[BitrixFieldRead]:
    client = BitrixRestClient()
    payload = client.call(
        "crm.item.fields",
        {"entityTypeId": entity_type_id},
    )
    result = payload.get("result", {})
    fields = result.get("fields", result if isinstance(result, dict) else {})
    if not isinstance(fields, dict):
        raise HTTPException(status_code=502, detail="Unexpected crm.item.fields response")

    return [
        BitrixFieldRead(
            code=code,
            title=str(field.get("title") or field.get("formLabel") or code),
            type=optional_str(field.get("type")),
            raw=field,
        )
        for code, field in fields.items()
        if isinstance(field, dict)
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
