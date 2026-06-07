from typing import Any
from time import sleep

import httpx
from fastapi import HTTPException

class BitrixRestClient:
    def __init__(
        self,
        webhook_url: str | None = None,
        domain: str | None = None,
        access_token: str | None = None,
    ) -> None:
        self.domain = normalize_domain(domain) if domain else None
        self.access_token = access_token
        self.webhook_url = (webhook_url or "").rstrip("/")
        if not self.webhook_url and not (self.domain and self.access_token):
            raise HTTPException(
                status_code=500,
                detail="Bitrix auth is not configured",
            )

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        request_params = dict(params or {})
        if self.domain and self.access_token:
            url = f"https://{self.domain}/rest/{method}.json"
            request_params["auth"] = self.access_token
        else:
            url = f"{self.webhook_url}/{method}.json"

        response = self.post_with_retry(url, request_params)
        payload = response.json()

        if "error" in payload:
            raise HTTPException(
                status_code=502,
                detail=f"Bitrix REST error {payload.get('error')}: {payload.get('error_description')}",
            )

        return payload

    def post_with_retry(self, url: str, params: dict[str, Any]) -> httpx.Response:
        last_error: Exception | None = None

        for attempt in range(3):
            try:
                response = httpx.post(url, json=params, timeout=30)
                response.raise_for_status()
                return response
            except httpx.HTTPStatusError as error:
                raise HTTPException(
                    status_code=502,
                    detail=f"Bitrix HTTP error {error.response.status_code}: {error.response.text}",
                ) from error
            except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as error:
                last_error = error
                if attempt < 2:
                    sleep(0.5 * (attempt + 1))
                    continue

        raise HTTPException(
            status_code=502,
            detail=f"Cannot connect to Bitrix24 REST API: {last_error}",
        )

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


def normalize_domain(value: str) -> str:
    return (
        value.replace("https://", "")
        .replace("http://", "")
        .strip("/")
    )
