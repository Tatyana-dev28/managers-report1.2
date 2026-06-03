# Служебные endpoints для настройки Bitrix24

Перед использованием нужно заполнить `BITRIX_WEBHOOK_URL` в `.env`.

## Проверка подключения

`GET /bitrix-settings/check`

Проверяет, что backend может выполнить REST-запрос к Bitrix24.

## Смарт-процессы

`GET /bitrix-settings/crm-types`

Из этого списка берутся:
- `BITRIX_MEETING_ENTITY_TYPE_ID` для смарт-процесса встреч;
- `BITRIX_CONTRACT_ENTITY_TYPE_ID` для смарт-процесса договоров.

## Воронки / направления

`GET /bitrix-settings/categories?entity_type_id=2`

`entity_type_id=2` означает сделки.

Из этого списка берутся:
- `BITRIX_COLD_BASE_DEAL_CATEGORY_ID`;
- `BITRIX_SALE_DEAL_CATEGORY_ID`.

## Стадии

`GET /bitrix-settings/stages?entity_type_id=2&category_id=0`

Для сделок `entity_type_id=2`, `category_id` равен ID нужной воронки.

Для смарт-процессов:

`GET /bitrix-settings/stages?entity_type_id=XXX&category_id=0`

где `XXX` - `entity_type_id` смарт-процесса.

Из этих списков берутся:
- `BITRIX_SALE_SUCCESS_STAGE_ID`;
- `BITRIX_MEETING_HELD_STAGE_IDS`;
- `BITRIX_CONTRACT_SENT_STAGE_ID`;
- `BITRIX_CONTRACT_SIGNED_STAGE_ID`;
- `BITRIX_INVOICE_SENT_STAGE_ID`;
- `BITRIX_INVOICE_PAID_STAGE_ID`.

## Поля сущности

`GET /bitrix-settings/fields?entity_type_id=XXX`

Нужно для проверки, как Bitrix24 называет поля у конкретной сущности.
