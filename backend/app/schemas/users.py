from pydantic import BaseModel, computed_field


class AuthUserRequest(BaseModel):
    bitrix_user_id: int
    first_name: str | None = None
    last_name: str | None = None
    is_admin: bool = False
    domain: str | None = None
    member_id: str | None = None


class UserRead(BaseModel):
    id: int
    bitrix_user_id: int
    first_name: str | None
    last_name: str | None
    role: str

    @computed_field
    @property
    def full_name(self) -> str:
        return " ".join(
            part for part in (self.first_name, self.last_name) if part
        )
