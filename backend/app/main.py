from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import bitrix_stateless, metrics
from app.core.config import get_settings


settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(metrics.router)
app.include_router(bitrix_stateless.router)


@app.get("/health")
def health_check() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "environment": settings.environment,
        "stateless": True,
    }
