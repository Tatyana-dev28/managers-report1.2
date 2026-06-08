from dataclasses import dataclass
from typing import Any

from app.integrations.bitrix import BitrixRestClient


DEAL_ENTITY_TYPE_ID = 2
INVOICE_ENTITY_TYPE_ID = 31
DEFAULT_INVOICE_CATEGORY_ID = 1


@dataclass(frozen=True)
class BitrixMetricSources:
    meeting_entity_type_id: int | None
    contract_entity_type_id: int | None
    invoice_entity_type_id: int
    cold_base_deal_category_id: int | None
    sale_deal_category_id: int
    sale_success_stage_id: str | None
    meeting_held_stage_ids: set[str]
    contract_sent_stage_id: str | None
    contract_signed_stage_id: str | None
    invoice_sent_stage_id: str | None
    invoice_paid_stage_id: str | None


def detect_metric_sources(client: BitrixRestClient) -> BitrixMetricSources:
    crm_types = client.list_all("crm.type.list")
    deal_categories = get_categories(client, DEAL_ENTITY_TYPE_ID)

    meeting_type = find_by_title(crm_types, "встреч")
    contract_type = find_by_title(crm_types, "договор")

    meeting_entity_type_id = as_int(first_present(meeting_type or {}, "entityTypeId", "ENTITY_TYPE_ID"))
    contract_entity_type_id = as_int(first_present(contract_type or {}, "entityTypeId", "ENTITY_TYPE_ID"))

    cold_base_category_id = get_category_id(find_by_title(deal_categories, "холод"))
    sale_category_id = get_sale_category_id(deal_categories)

    meeting_stages = get_stages(client, meeting_entity_type_id) if meeting_entity_type_id else []
    contract_stages = get_stages(client, contract_entity_type_id) if contract_entity_type_id else []
    invoice_stages = get_stages(client, INVOICE_ENTITY_TYPE_ID, DEFAULT_INVOICE_CATEGORY_ID)
    sale_stages = get_stages(client, DEAL_ENTITY_TYPE_ID, sale_category_id)

    meeting_held_stage = find_by_title(meeting_stages, "проведен")
    contract_sent_stage = find_by_title(contract_stages, "отправлен")
    contract_signed_stage = find_by_title(contract_stages, "подписан")
    invoice_sent_stage = find_by_title(invoice_stages, "отправлен")
    invoice_paid_stage = find_by_title(invoice_stages, "оплачен")
    sale_success_stage = find_success_stage(sale_stages)

    return BitrixMetricSources(
        meeting_entity_type_id=meeting_entity_type_id,
        contract_entity_type_id=contract_entity_type_id,
        invoice_entity_type_id=INVOICE_ENTITY_TYPE_ID,
        cold_base_deal_category_id=cold_base_category_id,
        sale_deal_category_id=sale_category_id,
        sale_success_stage_id=get_stage_id(sale_success_stage),
        meeting_held_stage_ids=optional_stage_set(meeting_held_stage),
        contract_sent_stage_id=get_stage_id(contract_sent_stage),
        contract_signed_stage_id=get_stage_id(contract_signed_stage),
        invoice_sent_stage_id=get_stage_id(invoice_sent_stage),
        invoice_paid_stage_id=get_stage_id(invoice_paid_stage),
    )


def get_categories(client: BitrixRestClient, entity_type_id: int) -> list[dict[str, Any]]:
    return client.list_all("crm.category.list", {"entityTypeId": entity_type_id})


def get_stages(
    client: BitrixRestClient,
    entity_type_id: int,
    category_id: int | None = None,
) -> list[dict[str, Any]]:
    resolved_category_id = resolve_category_id(client, entity_type_id, category_id)
    return client.list_all(
        "crm.status.list",
        {
            "filter": {"ENTITY_ID": get_stage_entity_id(entity_type_id, resolved_category_id)},
            "order": {"SORT": "ASC"},
        },
    )


def resolve_category_id(
    client: BitrixRestClient,
    entity_type_id: int,
    category_id: int | None,
) -> int:
    if category_id is not None:
        return category_id

    if entity_type_id == DEAL_ENTITY_TYPE_ID:
        return 0

    categories = get_categories(client, entity_type_id)
    default_category = next(
        (
            category
            for category in categories
            if normalize_text(str(first_present(category, "isDefault", "IS_DEFAULT"))) == "y"
        ),
        categories[0] if categories else None,
    )
    return as_int(first_present(default_category or {}, "id", "ID")) or 0


def get_stage_entity_id(entity_type_id: int, category_id: int) -> str:
    if entity_type_id == DEAL_ENTITY_TYPE_ID:
        return "DEAL_STAGE" if category_id == 0 else f"DEAL_STAGE_{category_id}"

    if entity_type_id == INVOICE_ENTITY_TYPE_ID:
        return f"SMART_INVOICE_STAGE_{category_id}"

    return f"DYNAMIC_{entity_type_id}_STAGE_{category_id}"


def find_by_title(rows: list[dict[str, Any]], *keywords: str) -> dict[str, Any] | None:
    normalized_keywords = [normalize_text(keyword) for keyword in keywords]
    for row in rows:
        title = normalize_text(
            str(first_present(row, "title", "TITLE", "name", "NAME") or "")
        )
        if all(keyword in title for keyword in normalized_keywords):
            return row
    return None


def find_success_stage(stages: list[dict[str, Any]]) -> dict[str, Any] | None:
    semantic_stage = next(
        (
            stage
            for stage in stages
            if normalize_text(str(first_present(stage, "SEMANTICS", "semantics") or "")) == "s"
        ),
        None,
    )
    if semantic_stage:
        return semantic_stage

    return find_by_title(stages, "заключ") or find_by_title(stages, "успеш") or find_by_title(stages, "подписан")


def get_sale_category_id(categories: list[dict[str, Any]]) -> int:
    default_sale = next(
        (
            category
            for category in categories
            if as_int(first_present(category, "id", "ID")) == 0
            and "продаж" in normalize_text(str(first_present(category, "name", "NAME") or ""))
        ),
        None,
    )
    sale_category = default_sale or find_by_title(categories, "продаж")
    return get_category_id(sale_category) or 0


def get_category_id(category: dict[str, Any] | None) -> int | None:
    return as_int(first_present(category or {}, "id", "ID"))


def get_stage_id(stage: dict[str, Any] | None) -> str | None:
    value = first_present(stage or {}, "STATUS_ID", "statusId")
    return None if value is None else str(value)


def optional_stage_set(stage: dict[str, Any] | None) -> set[str]:
    stage_id = get_stage_id(stage)
    return {stage_id} if stage_id else set()


def normalize_text(value: str) -> str:
    return value.lower().replace("ё", "е").strip()


def as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def first_present(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row:
            return row[key]
    return None
