import './style.css';
import type { BitrixAuthPayload } from './types';
import { getBitrixAuth } from './bitrix';

/**
 * Страница детализации звонков.
 * Открывается через BX24.openApplication() при клике на метрику звонков.
 */

// Типы данных звонка из voximplant.statistic.get
type CallRecord = {
  ID: string;
  CALL_ID: string;
  PORTAL_USER_ID: string;
  PHONE_NUMBER: string;
  CALL_START_DATE: string;
  CALL_DURATION: string;
  CALL_TYPE: string; // 1=incoming, 2=outgoing
  CALL_FAILED_CODE: string;
  CALL_VOTE: string;
  COST: string;
  COST_CURRENCY: string;
  CRM_ENTITY_TYPE: string;
  CRM_ENTITY_ID: string;
  CRM_ACTIVITY_ID: string;
  USER_NAME: string;
  USER_LAST_NAME: string;
  USER_LOGIN: string;
};

type DetailParams = {
  employee_id: string;
  date_from: string;
  date_to: string;
  metric: string;
};

// Соответствие кодов метрик человекочитаемым названиям
const METRIC_LABELS: Record<string, string> = {
  calls_total: 'Все звонки',
  outgoing_calls: 'Исходящие звонки',
  successful_outgoing_calls: 'Успешные исходящие',
  incoming_calls: 'Входящие звонки',
};

// Соответствие кодов CALL_TYPE
const CALL_TYPE_LABELS: Record<string, string> = {
  '1': 'Входящий',
  '2': 'Исходящий',
  '3': 'Переадресованный',
  '4': 'Обратный',
};

function formatDuration(seconds: string): string {
  const sec = parseInt(seconds, 10) || 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

function renderTable(calls: CallRecord[], params: DetailParams) {
  const label = METRIC_LABELS[params.metric] || 'Детализация звонков';

  if (calls.length === 0) {
    return `
      <div class="detail-container">
        <div class="detail-header">
          <h2>${escapeHtml(label)}</h2>
          <p class="detail-period">${escapeHtml(params.date_from)} — ${escapeHtml(params.date_to)}</p>
        </div>
        <div class="detail-empty">
          <p>Нет звонков за выбранный период</p>
        </div>
      </div>
    `;
  }

  const rows = calls.map((call) => `
    <tr>
      <td>${formatDate(call.CALL_START_DATE)}</td>
      <td>${escapeHtml(call.PHONE_NUMBER || '—')}</td>
      <td>${CALL_TYPE_LABELS[call.CALL_TYPE] || call.CALL_TYPE}</td>
      <td class="number-col">${formatDuration(call.CALL_DURATION)}</td>
      <td>${call.CALL_FAILED_CODE === '200' ? '✅ Успешно' : call.CALL_FAILED_CODE ? '❌ Код: ' + escapeHtml(call.CALL_FAILED_CODE) : '—'}</td>
      <td>${escapeHtml(call.USER_NAME + ' ' + call.USER_LAST_NAME || '—')}</td>
    </tr>
  `).join('');

  return `
    <div class="detail-container">
      <div class="detail-header">
        <h2>${escapeHtml(label)}</h2>
        <p class="detail-period">${escapeHtml(params.date_from)} — ${escapeHtml(params.date_to)}</p>
        <p class="detail-count">Всего звонков: ${calls.length}</p>
      </div>
      <div class="table-wrap">
        <table>
          <colgroup>
            <col style="width:160px">
            <col style="width:140px">
            <col style="width:100px">
            <col style="width:80px">
            <col style="width:100px">
            <col>
          </colgroup>
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Номер телефона</th>
              <th>Тип</th>
              <th class="number-col">Длительность</th>
              <th>Статус</th>
              <th>Сотрудник</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderError(message: string) {
  return `
    <div class="detail-container">
      <div class="detail-header">
        <h2>Детализация звонков</h2>
      </div>
      <div class="detail-empty">
        <p style="color:var(--danger)">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="detail-container">
      <div class="detail-header">
        <h2>Детализация звонков</h2>
      </div>
      <div class="detail-empty">
        <p>Загрузка данных...</p>
      </div>
    </div>
  `;
}

async function loadCalls(auth: BitrixAuthPayload, params: DetailParams): Promise<CallRecord[]> {
  const filter: Record<string, string | number> = {
    '=PORTAL_USER_ID': parseInt(params.employee_id, 10),
    '>=CALL_START_DATE': `${params.date_from} 00:00:00`,
    '<=CALL_START_DATE': `${params.date_to} 23:59:59`,
  };

  // Добавляем фильтры в зависимости от метрики
  switch (params.metric) {
    case 'outgoing_calls':
      filter['=CALL_TYPE'] = 2;
      break;
    case 'successful_outgoing_calls':
      filter['=CALL_TYPE'] = 2;
      filter['=CALL_FAILED_CODE'] = '200';
      break;
    case 'incoming_calls':
      // Входящие: показываем все
      break;
    // calls_total — без доп. фильтров
  }

  const allCalls: CallRecord[] = [];
  let start = 0;

  while (true) {
    const response = await fetch(
      `https://${auth.domain}/rest/voximplant.statistic.get.json?auth=${auth.access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FILTER: filter,
          SORT: { CALL_START_DATE: 'DESC' },
          START: start,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rows: CallRecord[] = data.result || [];
    allCalls.push(...rows);

    const total = data.total || 0;
    start += rows.length;

    if (start >= total || rows.length === 0) {
      break;
    }
  }

  return allCalls;
}

export async function startDetail() {
  const app = document.getElementById('app');
  if (!app) return;

  // Получаем параметры из BX24.placement.info()
  let params: DetailParams | null = null;

  if (window.BX24?.placement) {
    try {
      const info = window.BX24.placement.info();
      params = info?.options as DetailParams;
    } catch {
      // placement.info может не сработать
    }
  }

  // Fallback: читаем из URL
  if (!params) {
    const urlParams = new URLSearchParams(window.location.search);
    const empId = urlParams.get('employee_id');
    if (empId) {
      params = {
        employee_id: empId,
        date_from: urlParams.get('date_from') || '',
        date_to: urlParams.get('date_to') || '',
        metric: urlParams.get('metric') || 'calls_total',
      };
    }
  }

  if (!params || !params.employee_id) {
    app.innerHTML = renderError('Не переданы параметры для детализации');
    return;
  }

  app.innerHTML = renderLoading();

  try {
    const auth = await getBitrixAuth();
    const calls = await loadCalls(auth, params);
    app.innerHTML = renderTable(calls, params);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    app.innerHTML = renderError(`Ошибка загрузки данных: ${message}`);
  }
}

// Запускаем, если BX24 доступен
if (window.BX24) {
  window.BX24.init(() => {
    startDetail();
  });
} else {
  // Для тестирования вне портала
  startDetail();
}