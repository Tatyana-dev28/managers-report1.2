# Деплой на Timeweb Cloud

## 1. Backend

Создать приложение из репозитория и выбрать:

- контекст сборки: `backend`
- Dockerfile: `backend/Dockerfile`
- порт приложения: `8000`

Переменные окружения backend задаются в панели Timeweb. За основу взять:

- `backend/.env.production.example`

Обязательные переменные:

- `DATABASE_URL`
- `FRONTEND_APP_URL`
- `CORS_ORIGINS`
- `BITRIX_WEBHOOK_URL`
- все `BITRIX_*` настройки стадий и сущностей

После запуска проверить:

- `https://backend-domain/health`
- `https://backend-domain/bitrix-settings/check`

## 2. Frontend

Создать отдельное приложение из того же репозитория и выбрать:

- контекст сборки: `frontend`
- Dockerfile: `frontend/Dockerfile`
- порт приложения: `80`

Переменная окружения frontend:

```env
VITE_API_BASE_URL=https://backend-domain
```

После запуска frontend-домен нужно подставить в backend:

```env
FRONTEND_APP_URL=https://frontend-domain
CORS_ORIGINS=["https://frontend-domain"]
```

После изменения переменных backend нужно перезапустить.

## 3. Битрикс24

В тестовом приложении Битрикс24 указать URL frontend:

```text
https://frontend-domain
```

На время первого теста оставить:

```env
REMINDERS_ENABLED=false
```

После проверки уведомлений вручную можно включить:

```env
REMINDERS_ENABLED=true
```
