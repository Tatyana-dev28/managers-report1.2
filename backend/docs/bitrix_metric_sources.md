# Источники системных показателей Bitrix24

Фильтрация по сотруднику:
- звонки: `PORTAL_USER_ID`;
- сделки, счета и смарт-процессы: `assignedById`;
- переходы в стадии: сначала `crm.stagehistory.list`, затем проверка ответственного через `crm.item.list`.

Фильтрация по дате:
- созданные сущности: `createdTime`;
- звонки: `CALL_START_DATE`;
- попадание в стадию: `CREATED_TIME` записи истории стадии.

| Показатель | REST-источник | Логика |
| --- | --- | --- |
| Кол-во проведенных встреч | `crm.stagehistory.list` + `crm.item.list` по СП встреч | Элемент встречи попал в одну из стадий `BITRIX_MEETING_HELD_STAGE_IDS` за период, ответственный сотрудник совпадает. |
| Кол-во назначенных встреч | `crm.item.list` по СП встреч | Элемент встречи создан за период, `assignedById` равен сотруднику. |
| Сумма дозвонов и звонков | `voximplant.statistic.get` | Все звонки сотрудника за период. |
| Кол-во исходящих дозвонов | `voximplant.statistic.get` | `CALL_TYPE = 1`. |
| Кол-во исходящих успешных дозвонов | `voximplant.statistic.get` | `CALL_TYPE = 1`, `CALL_DURATION > 10`, `CALL_FAILED_CODE` пустой или `200`. |
| Кол-во входящих звонков | `voximplant.statistic.get` | `CALL_TYPE = 2` или `CALL_TYPE = 3`. |
| Кол-во отправленных КП | `crm.item.list` для сделок `entityTypeId = 2` | Сделка создана за период в воронке `BITRIX_COLD_BASE_DEAL_CATEGORY_ID`, ответственный сотрудник совпадает. |
| Кол-во отправленных договоров | `crm.stagehistory.list` + `crm.item.list` по СП договоров | Договор попал в стадию `BITRIX_CONTRACT_SENT_STAGE_ID` за период, ответственный сотрудник совпадает. |
| Кол-во подписанных договоров | `crm.stagehistory.list` + `crm.item.list` по СП договоров | Договор попал в стадию `BITRIX_CONTRACT_SIGNED_STAGE_ID` за период, ответственный сотрудник совпадает. |
| Кол-во отправленных счетов | `crm.stagehistory.list` + `crm.item.list` по счетам | Счет попал в стадию `BITRIX_INVOICE_SENT_STAGE_ID` за период, ответственный сотрудник совпадает. |
| Кол-во оплаченных счетов | `crm.stagehistory.list` + `crm.item.list` по счетам | Счет попал в стадию `BITRIX_INVOICE_PAID_STAGE_ID` за период, ответственный сотрудник совпадает. |
| Кол-во новых сделок | `crm.item.list` для сделок `entityTypeId = 2` | Сделка создана за период, ответственный сотрудник совпадает. |
| Кол-во успешных сделок в воронке Продажа | `crm.stagehistory.list` + `crm.item.list` для сделок | Сделка попала в стадию `BITRIX_SALE_SUCCESS_STAGE_ID` в воронке `BITRIX_SALE_DEAL_CATEGORY_ID` за период, ответственный сотрудник совпадает. |
| Сумма оплаченных счетов | `crm.stagehistory.list` + `crm.item.list` по счетам | Сумма поля `opportunity` у счетов, которые попали в стадию `BITRIX_INVOICE_PAID_STAGE_ID` за период. |
