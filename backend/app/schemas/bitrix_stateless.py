from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class BitrixAuthPayload(BaseModel):
    domain: str
    access_token: str


class BitrixUsersRequest(BaseModel):
    auth: BitrixAuthPayload


class BitrixUserRead(BaseModel):
    bitrix_user_id: int
    first_name: str | None
    last_name: str | None
    full_name: str


class BitrixMetricSettings(BaseModel):
    meeting_entity_type_id: int | None = None
    contract_entity_type_id: int | None = None
    invoice_entity_type_id: int = 31
    cold_base_deal_category_id: int | None = None
    sale_deal_category_id: int | None = None
    sale_success_stage_id: str | None = None
    meeting_held_stage_ids: list[str] = Field(default_factory=list)
    contract_sent_stage_id: str | None = None
    contract_signed_stage_id: str | None = None
    invoice_sent_stage_id: str | None = None
    invoice_paid_stage_id: str | None = None


class BitrixSystemReportRequest(BaseModel):
    auth: BitrixAuthPayload
    date_from: date
    date_to: date
    bitrix_user_ids: list[int] = Field(default_factory=list)
    settings: BitrixMetricSettings | None = None


class BitrixSystemMetricRead(BaseModel):
    metric_code: str
    metric_title: str
    is_money: bool
    system_value: str


class BitrixEmployeeSystemReportRead(BaseModel):
    bitrix_user_id: int
    full_name: str
    metrics: list[BitrixSystemMetricRead]


class BitrixSystemReportRead(BaseModel):
    date_from: date
    date_to: date
    employees: list[BitrixEmployeeSystemReportRead]


class BitrixCrmTypeRead(BaseModel):
    id: int | None = None
    entity_type_id: int
    title: str
    code: str | None = None


class BitrixCategoryRead(BaseModel):
    id: int
    entity_type_id: int
    name: str
    sort: int | None = None


class BitrixStageRead(BaseModel):
    status_id: str
    name: str
    sort: int | None = None
    entity_id: str | None = None
    semantics: str | None = None


class BitrixSettingsRequest(BaseModel):
    auth: BitrixAuthPayload


class BitrixSettingsSaveRequest(BaseModel):
    auth: BitrixAuthPayload
    settings: BitrixMetricSettings


class BitrixCategoriesRequest(BaseModel):
    auth: BitrixAuthPayload
    entity_type_id: int


class BitrixStagesRequest(BaseModel):
    auth: BitrixAuthPayload
    entity_type_id: int
    category_id: int = 0


# --- Детализация метрик ---


class BitrixMetricDetailRequest(BaseModel):
    auth: BitrixAuthPayload
    metric_code: str
    employee_id: int
    date_from: date
    date_to: date
    settings: BitrixMetricSettings | None = None


class BitrixMetricDetailRow(BaseModel):
    """Одна строка детализации. Поля — сырые данные из API Битрикс24."""
    columns: dict[str, Any]
    employee_name: str = ""


class BitrixMetricDetailRead(BaseModel):
    metric_code: str
    metric_title: str
    rows: list[BitrixMetricDetailRow]
