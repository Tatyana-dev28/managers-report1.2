from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import get_settings


class BitrixRestClient:
    def __init__(self, webhook_url: str | None = None) -> None:
        settings = get_settings()
        self.webhook_url = (webhook_url or settings.bitrix_webhook_url or "").rstrip("/")
        if not self.webhook_url:
            raise HTTPException(
                status_code=500,
                detail="BITRIX_WEBHOOK_URL is not configured",
            )

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.webhook_url}/{method}.json"
        response = httpx.post(url, json=params or {}, timeout=30)
        response.raise_for_status()
        payload = response.json()

        if "error" in payload:
            raise HTTPException(
                status_code=502,
                detail=f"Bitrix REST error {payload.get('error')}: {payload.get('error_description')}",
            )

        return payload

    def list_all(self, method: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        request_params = dict(params or {})
        start: int | None = 0

        while start is not None:
            if start > 0:
                request_params["start"] = start

            payload = self.call(method, request_params)
            result = payload.get("result", [])

            if isinstance(result, dict):
                items = get_result_items(result)
            else:
                items = result

            rows.extend(items)
            start = payload.get("next")

        return rows


def get_result_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("items", "types", "categories", "stages", "statuses"):
        value = result.get(key)
        if isinstance(value, list):
            return value

    return []
