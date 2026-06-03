from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    auth,
    bitrix_metrics,
    bitrix_settings,
    demo,
    metrics,
    plans,
    reminders,
    report_settings,
    reports,
    submissions,
    users,
)
from app.core.config import get_settings
from app.jobs.system_metrics_scheduler import (
    start_system_metrics_scheduler,
    stop_system_metrics_scheduler,
)
from app.jobs.reminder_scheduler import (
    start_reminder_scheduler,
    stop_reminder_scheduler,
)


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_system_metrics_scheduler()
    start_reminder_scheduler()
    yield
    stop_reminder_scheduler()
    stop_system_metrics_scheduler()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(metrics.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(bitrix_settings.router)
app.include_router(bitrix_metrics.router)
if settings.demo_mode:
    app.include_router(demo.router)
app.include_router(reports.router)
app.include_router(submissions.router)
app.include_router(plans.router)
app.include_router(reminders.router)
app.include_router(report_settings.router)


@app.get("/health")
def health_check() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "environment": settings.environment,
        "demo_mode": settings.demo_mode,
    }
