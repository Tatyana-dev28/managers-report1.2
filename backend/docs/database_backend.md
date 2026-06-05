# База данных и Bitrix D7

## Текущий backend

Приложение написано на FastAPI/Python и работает с базой через SQLAlchemy.
Для production можно использовать MySQL:

```env
DATABASE_URL=mysql+pymysql://USER:PASSWORD@HOST:3306/DB_NAME?charset=utf8mb4
```

Локально PostgreSQL тоже остается возможным:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DB_NAME
```

## Bitrix D7 ORM

Bitrix D7 ORM относится к PHP-фреймворку Битрикса. Его нельзя подключить напрямую
к текущему FastAPI/Python backend.

Использовать D7 ORM можно только при другой архитектуре:

- backend переписывается на PHP;
- приложение становится модулем/компонентом внутри Bitrix;
- код выполняется в окружении Битрикса, где доступен D7.

Для внешнего приложения Bitrix24, которое открывается во фрейме и общается с
порталом через REST API, правильная схема остается такой:

- данные Битрикс24 получать через REST API;
- собственные настройки/планы/отправки хранить в своей базе приложения;
- базой приложения может быть MySQL.
