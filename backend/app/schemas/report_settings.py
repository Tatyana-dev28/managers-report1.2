from pydantic import BaseModel

from app.schemas.users import UserRead


class ReportAssigneesRead(BaseModel):
    selected_bitrix_user_ids: list[int]
    available_users: list[UserRead]


class ReportAssigneesSaveRequest(BaseModel):
    bitrix_user_ids: list[int]


class ReportAssigneesSaveResponse(BaseModel):
    selected_bitrix_user_ids: list[int]
