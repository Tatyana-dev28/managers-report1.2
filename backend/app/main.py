import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import bitrix_stateless, metrics
from app.core.config import get_settings


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(title=settings.app_name)


@app.middleware("http")
async def log_server_errors(request: Request, call_next):
    try:
        response = await call_next(request)
        if response.status_code >= 500:
            body = await request.body()
            logger.error(
                "HTTP %s %s -> %s\nRequest body: %s",
                request.method,
                request.url.path,
                response.status_code,
                body.decode("utf-8", errors="replace"),
            )
        return response
    except Exception as exc:
        logger.exception("Unhandled error processing %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": str(exc)})


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
