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
// 1 = Исходящий, 2 = Входящий, 3 = Переадресованный, 4 = Обратный
const CALL_TYPE_LABELS: Record<string, string> = {
  '1': 'Исходящий',
  '2': 'Входящий',
  '3': 'Переадресованный',
  '4': 'Обратный',
};

// --- Конфигурация колонок ---

type ColumnDef = {
  key: string;
  title: string;
  /** Ширина в процентах */
  defaultWidth: number;
  /** Минимальная ширина в процентах */
  minWidth: number;
  /** Функция форматирования значения ячейки */
  render: (call: CallRecord) => string;
  /** CSS-класс для th/td */
  className?: string;
};

const COLUMNS: ColumnDef[] = [
  {
    key: 'employee',
    title: 'Сотрудник',
    defaultWidth: 22,
    minWidth: 10,
    render: (call) => escapeHtml(getEmployeeName(call)),
  },
  {
    key: 'phone',
    title: 'Номер телефона',
    defaultWidth: 18,
    minWidth: 10,
    render: (call) => escapeHtml(call.PHONE_NUMBER || '—'),
  },
  {
    key: 'type',
    title: 'Тип звонка',
    defaultWidth: 16,
    minWidth: 8,
    render: (call) => CALL_TYPE_LABELS[call.CALL_TYPE] || call.CALL_TYPE,
  },
  {
    key: 'date',
    title: 'Дата и время',
    defaultWidth: 28,
    minWidth: 12,
    render: (call) => formatDate(call.CALL_START_DATE),
  },
  {
    key: 'duration',
    title: 'Длительность',
    defaultWidth: 16,
    minWidth: 8,
    className: 'number-col',
    render: (call) => formatDuration(call.CALL_DURATION),
  },
];

// Кэш пользователей: PORTAL_USER_ID -> имя + фамилия
let userNameCache: Record<string, string> = {};

/**
 * Закрывает страницу детализации и возвращается в основное приложение.
 */
function closeDetail() {
  if (window.BX24?.closeApplication) {
    window.BX24.closeApplication();
  } else {
    window.history.back();
  }
}

function formatDuration(seconds: string): string {
  const sec = parseInt(seconds, 10) || 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

function getEmployeeName(call: CallRecord): string {
  const cached = userNameCache[call.PORTAL_USER_ID];
  if (cached) return cached;

  const name = (call.USER_NAME || '').trim();
  const lastName = (call.USER_LAST_NAME || '').trim();
  if (name || lastName) {
    return `${name} ${lastName}`.trim();
  }

  return `ID: ${call.PORTAL_USER_ID || '—'}`;
}

/**
 * Загружает список пользователей через user.get и заполняет кэш userNameCache.
 */
async function loadUserNames(auth: BitrixAuthPayload): Promise<void> {
  try {
    const response = await fetch(
      `https://${auth.domain}/rest/user.get.json?auth=${auth.access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FILTER: { ACTIVE: true },
        }),
      },
    );

    if (!response.ok) return;

    const data = await response.json();
    const users: Array<{ ID: string; NAME: string; LAST_NAME: string }> = data.result || [];

    for (const user of users) {
      const name = (user.NAME || '').trim();
      const lastName = (user.LAST_NAME || '').trim();
      if (name || lastName) {
        userNameCache[user.ID] = `${name} ${lastName}`.trim();
      }
    }
  } catch {
    // Ошибка загрузки пользователей — не критично, покажем ID
  }
}

// --- Состояние колонок (ширина в %) ---

type ColumnState = {
  key: string;
  width: number;
};

let columnStates: ColumnState[] = [];

function getDefaultColumnStates(): ColumnState[] {
  return COLUMNS.map((col) => ({
    key: col.key,
    width: col.defaultWidth,
  }));
}

function loadColumnStates(): ColumnState[] {
  try {
    const saved = localStorage.getItem('detail_column_states');
    if (saved) {
      const parsed: ColumnState[] = JSON.parse(saved);
      const savedKeys = new Set(parsed.map((s) => s.key));
      const allKeys = new Set(COLUMNS.map((c) => c.key));
      if (savedKeys.size === allKeys.size && [...allKeys].every((k) => savedKeys.has(k))) {
        return parsed;
      }
    }
  } catch {
    // игнорируем
  }
  return getDefaultColumnStates();
}

function saveColumnStates(states: ColumnState[]) {
  try {
    localStorage.setItem('detail_column_states', JSON.stringify(states));
  } catch {
    // игнорируем
  }
}

// --- Resize колонок (как в эталонном проекте) ---

let resizeColIndex: number | null = null;
let resizeStartX = 0;
let resizeStartWidth = 0;

function initColumnResize(headerRow: HTMLTableRowElement, states: ColumnState[]) {
  const ths = headerRow.querySelectorAll<HTMLTableHeaderCellElement>('th');

  ths.forEach((th, index) => {
    const resizer = document.createElement('button');
    resizer.className = 'column-resizer';
    resizer.dataset.columnIndex = String(index);
    th.appendChild(resizer);

    resizer.addEventListener('pointerdown', (event) => {
      event.preventDefault();

      const currentIndex = index;
      const currentColumn = COLUMNS[currentIndex];
      const pairedColumn = COLUMNS[currentIndex + 1] ?? COLUMNS[currentIndex - 1];
      const direction = COLUMNS[currentIndex + 1] ? 1 : -1;

      if (!currentColumn || !pairedColumn) return;

      resizeColIndex = index;
      resizeStartX = event.clientX;
      resizeStartWidth = states[index].width;

      const table = document.querySelector<HTMLTableElement>('.detail-table');
      if (!table) return;
      const tableWidth = table.getBoundingClientRect().width;

      document.body.classList.add('is-resizing-column');
      resizer.setPointerCapture(event.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (resizeColIndex === null) return;

        const deltaPercent = ((moveEvent.clientX - resizeStartX) / tableWidth) * 100 * direction;
        const pairIndex = currentIndex + 1 < states.length ? currentIndex + 1 : currentIndex - 1;
        const availableWidth = resizeStartWidth + states[pairIndex].width;
        const nextCurrentWidth = Math.min(
          availableWidth - pairedColumn.minWidth,
          Math.max(currentColumn.minWidth, resizeStartWidth + deltaPercent),
        );

        states[currentIndex].width = nextCurrentWidth;
        states[pairIndex].width = availableWidth - nextCurrentWidth;

        const colgroup = document.querySelector('colgroup');
        if (colgroup) {
          const cols = colgroup.querySelectorAll('col');
          states.forEach((state, i) => {
            if (cols[i]) {
              cols[i].style.width = `${state.width}%`;
            }
          });
        }
      };

      const handlePointerUp = () => {
        if (resizeColIndex !== null) {
          saveColumnStates(states);
        }
        resizeColIndex = null;
        document.body.classList.remove('is-resizing-column');
        resizer.releasePointerCapture(event.pointerId);
        resizer.removeEventListener('pointermove', handlePointerMove);
        resizer.removeEventListener('pointerup', handlePointerUp);
        resizer.removeEventListener('pointercancel', handlePointerUp);
      };

      resizer.addEventListener('pointermove', handlePointerMove);
      resizer.addEventListener('pointerup', handlePointerUp);
      resizer.addEventListener('pointercancel', handlePointerUp);
    });
  });
}

// --- Рендеринг ---

function renderTable(calls: CallRecord[], params: DetailParams) {
  const label = METRIC_LABELS[params.metric] || 'Детализация звонков';

  const backButton = '<button class="detail-back-btn" onclick="closeDetail()">← Назад</button>';

  if (calls.length === 0) {
    return `
      <div class="detail-container">
        <div class="detail-header">
          ${backButton}
          <h2>${escapeHtml(label)}</h2>
          <p class="detail-period">${escapeHtml(params.date_from)} — ${escapeHtml(params.date_to)}</p>
        </div>
        <div class="detail-empty">
          <p>Нет звонков за выбранный период</p>
        </div>
      </div>
    `;
  }

  columnStates = loadColumnStates();

  const colHtml = columnStates
    .map((state) => `<col style="width:${state.width}%">`)
    .join('');

  const headerHtml = columnStates
    .map((state) => {
      const colDef = COLUMNS.find((c) => c.key === state.key);
      const className = colDef?.className ? ` class="${colDef.className}"` : '';
      return `<th${className} data-col-key="${state.key}">
        <span class="th-text">${escapeHtml(colDef?.title || state.key)}</span>
      </th>`;
    })
    .join('');

  const rowsHtml = calls
    .map((call) => {
      const cellsHtml = columnStates
        .map((state) => {
          const colDef = COLUMNS.find((c) => c.key === state.key);
          const className = colDef?.className ? ` class="${colDef.className}"` : '';
          return `<td${className}>${colDef ? colDef.render(call) : ''}</td>`;
        })
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('');

  return `
    <div class="detail-container">
      <div class="detail-header">
        ${backButton}
        <h2>${escapeHtml(label)}</h2>
        <p class="detail-period">${escapeHtml(params.date_from)} — ${escapeHtml(params.date_to)}</p>
      </div>
      <div class="table-wrap">
        <table class="detail-table">
          <colgroup>${colHtml}</colgroup>
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>
            ${rowsHtml}
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
        <button class="detail-back-btn" onclick="closeDetail()">← Назад</button>
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
        <button class="detail-back-btn" onclick="closeDetail()">← Назад</button>
        <h2>Детализация звонков</h2>
      </div>
      <div class="detail-empty">
        <p>Загрузка данных...</p>
      </div>
    </div>
  `;
}

async function fetchCallsByFilter(
  auth: BitrixAuthPayload,
  filter: Record<string, string | number>,
): Promise<CallRecord[]> {
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

async function loadCalls(auth: BitrixAuthPayload, params: DetailParams): Promise<CallRecord[]> {
  const baseFilter: Record<string, string | number> = {
    '=PORTAL_USER_ID': parseInt(params.employee_id, 10),
    '>=CALL_START_DATE': `${params.date_from} 00:00:00`,
    '<=CALL_START_DATE': `${params.date_to} 23:59:59`,
  };

  switch (params.metric) {
    case 'outgoing_calls':
      return fetchCallsByFilter(auth, { ...baseFilter, '=CALL_TYPE': 1 });
    case 'successful_outgoing_calls':
      return fetchCallsByFilter(auth, {
        ...baseFilter,
        '=CALL_TYPE': 1,
        '=CALL_FAILED_CODE': '200',
      });
    case 'incoming_calls': {
      // Входящие = CALL_TYPE 2 (входящий) + 3 (переадресованный)
      // voximplant.statistic.get не поддерживает множественный фильтр (IN),
      // поэтому делаем два запроса и объединяем результаты
      const [type2, type3] = await Promise.all([
        fetchCallsByFilter(auth, { ...baseFilter, '=CALL_TYPE': 2 }),
        fetchCallsByFilter(auth, { ...baseFilter, '=CALL_TYPE': 3 }),
      ]);
      // Объединяем и сортируем по дате (DESC)
      const merged = [...type2, ...type3];
      merged.sort((a, b) => b.CALL_START_DATE.localeCompare(a.CALL_START_DATE));
      return merged;
    }
    default:
      // calls_total — все звонки без фильтра по CALL_TYPE
      return fetchCallsByFilter(auth, baseFilter);
  }
}

/**
 * Инициализирует drag & drop и resize после рендеринга таблицы.
 */
function initTableInteractions() {
  const table = document.querySelector<HTMLTableElement>('.detail-table');
  if (!table) return;

  const headerRow = table.querySelector<HTMLTableRowElement>('thead tr');
  if (!headerRow) return;

  const states = loadColumnStates();

  initColumnResize(headerRow, states);
}

/**
 * Делает функцию closeDetail глобально доступной для onclick в HTML-шаблонах.
 */
(window as unknown as Record<string, unknown>).closeDetail = closeDetail;

export async function startDetail() {
  const app = document.getElementById('app');
  if (!app) return;

  let params: DetailParams | null = null;

  if (window.BX24?.placement) {
    try {
      const info = window.BX24.placement.info();
      params = info?.options as DetailParams;
    } catch {
      // placement.info может не сработать
    }
  }

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
    await loadUserNames(auth);
    const calls = await loadCalls(auth, params);
    app.innerHTML = renderTable(calls, params);
    initTableInteractions();
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
  startDetail();
}