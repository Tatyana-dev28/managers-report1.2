from fastapi import APIRouter

from app.schemas.bitrix_stateless import (
    BitrixCategoriesRequest,
    BitrixCategoryRead,
    BitrixCrmTypeRead,
    BitrixMetricSettings,
    BitrixSettingsRequest,
    BitrixSettingsSaveRequest,
    BitrixStageRead,
    BitrixStagesRequest,
    BitrixSystemReportRead,
    BitrixSystemReportRequest,
    BitrixUserRead,
    BitrixUsersRequest,
)
from app.services.bitrix_app_settings_service import (
    get_categories,
    get_crm_types,
    get_saved_metric_settings,
    get_stages,
    save_metric_settings,
)
from app.services.bitrix_stateless_service import build_system_report, get_bitrix_users


router = APIRouter(prefix="/bitrix", tags=["bitrix"])


@router.post("/users", response_model=list[BitrixUserRead])
def list_users(payload: BitrixUsersRequest) -> list[BitrixUserRead]:
    return get_bitrix_users(payload.auth)


@router.post("/settings/get", response_model=BitrixMetricSettings | None)
def get_settings(payload: BitrixSettingsRequest) -> BitrixMetricSettings | None:
    return get_saved_metric_settings(payload.auth)


@router.post("/settings/save", response_model=BitrixMetricSettings)
def save_settings(payload: BitrixSettingsSaveRequest) -> BitrixMetricSettings:
    return save_metric_settings(payload.auth, payload.settings)


@router.post("/crm-types", response_model=list[BitrixCrmTypeRead])
def list_crm_types(payload: BitrixSettingsRequest) -> list[BitrixCrmTypeRead]:
    return get_crm_types(payload.auth)


@router.post("/categories", response_model=list[BitrixCategoryRead])
def list_categories(payload: BitrixCategoriesRequest) -> list[BitrixCategoryRead]:
    return get_categories(payload.auth, payload.entity_type_id)


@router.post("/stages", response_model=list[BitrixStageRead])
def list_stages(payload: BitrixStagesRequest) -> list[BitrixStageRead]:
    return get_stages(payload.auth, payload.entity_type_id, payload.category_id)


@router.post("/system-report", response_model=BitrixSystemReportRead)
def system_report(payload: BitrixSystemReportRequest) -> BitrixSystemReportRead:
    return build_system_report(
        auth=payload.auth,
        date_from=payload.date_from,
        date_to=payload.date_to,
        bitrix_user_ids=payload.bitrix_user_ids,
        metric_settings=payload.settings,
    )
