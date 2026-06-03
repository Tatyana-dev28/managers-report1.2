from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.users import AuthUserRequest, UserRead
from app.services.auth_service import authenticate_user


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/me", response_model=UserRead)
def auth_me(
    payload: AuthUserRequest,
    db: Session = Depends(get_db),
) -> UserRead:
    return authenticate_user(db, payload)
