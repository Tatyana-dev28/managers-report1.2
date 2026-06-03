from typing import Any

from pydantic import BaseModel


class BitrixConnectionCheck(BaseModel):
    ok: bool
    message: str


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


class BitrixFieldRead(BaseModel):
    code: str
    title: str
    type: str | None = None
    raw: dict[str, Any]
