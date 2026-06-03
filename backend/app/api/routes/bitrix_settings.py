from fastapi import APIRouter, Query

from app.schemas.bitrix_settings import (
    BitrixCategoryRead,
    BitrixConnectionCheck,
    BitrixCrmTypeRead,
    BitrixFieldRead,
    BitrixStageRead,
)
from app.services.bitrix_settings_service import (
    check_bitrix_connection,
    get_categories,
    get_crm_types,
    get_fields,
    get_stages,
)


router = APIRouter(prefix="/bitrix-settings", tags=["bitrix-settings"])


@router.get("/check", response_model=BitrixConnectionCheck)
def check_connection() -> BitrixConnectionCheck:
    return check_bitrix_connection()


@router.get("/crm-types", response_model=list[BitrixCrmTypeRead])
def list_crm_types() -> list[BitrixCrmTypeRead]:
    return get_crm_types()


@router.get("/categories", response_model=list[BitrixCategoryRead])
def list_categories(
    entity_type_id: int = Query(..., ge=1),
) -> list[BitrixCategoryRead]:
    return get_categories(entity_type_id)


@router.get("/stages", response_model=list[BitrixStageRead])
def list_stages(
    entity_type_id: int = Query(..., ge=1),
    category_id: int = Query(0, ge=0),
) -> list[BitrixStageRead]:
    return get_stages(entity_type_id=entity_type_id, category_id=category_id)


@router.get("/fields", response_model=list[BitrixFieldRead])
def list_fields(
    entity_type_id: int = Query(..., ge=1),
) -> list[BitrixFieldRead]:
    return get_fields(entity_type_id)
