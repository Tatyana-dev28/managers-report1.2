from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Managers Daily Report"
    environment: str = "local"
    demo_mode: bool = True

    database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/"
        "managers_daily_report"
    )
    storage_backend: str = "postgres"

    timezone: str = "Europe/Moscow"
    morning_reminder_time: str = "09:00"
    afternoon_reminder_time: str = "13:00"
    evening_reminder_time: str = "17:00"
    reminders_enabled: bool = False
    frontend_app_url: str = "http://localhost:5173"
    manager_work_position_keywords: str = "менеджер по продажам"

    system_metrics_auto_collect_enabled: bool = True
    system_metrics_collect_interval_minutes: int = 60

    cors_origins: list[str] = ["http://localhost:5173"]

    bitrix_webhook_url: str | None = None
    bitrix_meeting_entity_type_id: int | None = None
    bitrix_contract_entity_type_id: int | None = None
    bitrix_invoice_entity_type_id: int = 31

    bitrix_cold_base_deal_category_id: int | None = None
    bitrix_sale_deal_category_id: int | None = None
    bitrix_sale_success_stage_id: str | None = None

    bitrix_meeting_held_stage_ids: str = ""
    bitrix_contract_sent_stage_id: str | None = None
    bitrix_contract_signed_stage_id: str | None = None
    bitrix_invoice_sent_stage_id: str | None = None
    bitrix_invoice_paid_stage_id: str | None = None

    @field_validator(
        "bitrix_webhook_url",
        "bitrix_meeting_entity_type_id",
        "bitrix_contract_entity_type_id",
        "bitrix_cold_base_deal_category_id",
        "bitrix_sale_deal_category_id",
        "bitrix_sale_success_stage_id",
        "bitrix_contract_sent_stage_id",
        "bitrix_contract_signed_stage_id",
        "bitrix_invoice_sent_stage_id",
        "bitrix_invoice_paid_stage_id",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, value):
        return None if value == "" else value

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
