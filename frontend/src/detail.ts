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
  defaultWidth: number;
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
    defaultWidth: 160,
    minWidth: 80,
    render: (call) => escapeHtml(getEmployeeName(call)),
  },
  {
    key: 'phone',
    title: 'Номер телефона',
    defaultWidth: 140,
    minWidth: 80,
    render: (call) => escapeHtml(call.PHONE_NUMBER || '—'),
  },
  {
    key: 'type',
    title: 'Тип звонка',
    defaultWidth: 120,
    minWidth: 70,
    render: (call) => CALL_TYPE_LABELS[call.CALL_TYPE] || call.CALL_TYPE,
  },
  {
    key: 'date',
    title: 'Дата и время',
    defaultWidth: 160,
    minWidth: 100,
    render: (call) => formatDate(call.CALL_START_DATE),
  },
  {
    key: 'duration',
    title: 'Длительность',
    defaultWidth: 110,
    minWidth: 70,
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

// --- Состояние колонок (порядок, ширина) ---

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

// --- Drag & drop для колонок (без визуальных индикаторов) ---

let dragColIndex: number | null = null;

function initColumnDrag(headerRow: HTMLTableRowElement, states: ColumnState[]) {
  const ths = headerRow.querySelectorAll<HTMLTableHeaderCellElement>('th');

  ths.forEach((th, index) => {
    th.draggable = true;

    th.addEventListener('dragstart', (e) => {
      dragColIndex = index;
      e.dataTransfer?.setData('text/plain', String(index));
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    th.addEventListener('dragend', () => {
      dragColIndex = null;
    });

    th.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragColIndex === null || dragColIndex === index) return;
      e.dataTransfer!.dropEffect = 'move';
    });

    th.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragColIndex === null || dragColIndex === index) return;

      const fromIndex = dragColIndex;
      const rect = th.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      let toIndex = index;
      if (e.clientX > midX) {
        toIndex = index + 1;
      }

      const [moved] = states.splice(fromIndex, 1);
      let adjustedTo = toIndex;
      if (fromIndex < toIndex) {
        adjustedTo = toIndex - 1;
      }
      states.splice(adjustedTo, 0, moved);

      saveColumnStates(states);
      applyColumnOrder(states);
    });
  });
}

function applyColumnOrder(states: ColumnState[]) {
  const table = document.querySelector<HTMLTableElement>('.detail-table');
  if (!table) return;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (!thead || !tbody) return;

  const headerRow = thead.querySelector('tr');
  if (!headerRow) return;

  const colgroup = table.querySelector('colgroup');
  if (!colgroup) return;

  const cols = colgroup.querySelectorAll('col');
  const ths = headerRow.querySelectorAll('th');
  const rows = tbody.querySelectorAll('tr');

  const colMap = new Map<string, HTMLTableColElement>();
  const thMap = new Map<string, HTMLTableHeaderCellElement>();
  const tdMaps: Map<string, HTMLTableCellElement>[] = [];

  cols.forEach((col, i) => {
    const key = states[i]?.key || COLUMNS[i]?.key;
    if (key) colMap.set(key, col);
  });

  ths.forEach((th, i) => {
    const key = states[i]?.key || COLUMNS[i]?.key;
    if (key) thMap.set(key, th);
  });

  rows.forEach((row) => {
    const tdMap = new Map<string, HTMLTableCellElement>();
    row.querySelectorAll('td').forEach((td, i) => {
      const key = states[i]?.key || COLUMNS[i]?.key;
      if (key) tdMap.set(key, td);
    });
    tdMaps.push(tdMap);
  });

  states.forEach((state, newIndex) => {
    const col = colMap.get(state.key);
    const th = thMap.get(state.key);
    if (col) colgroup.appendChild(col);
    if (th) headerRow.appendChild(th);

    tdMaps.forEach((tdMap) => {
      const td = tdMap.get(state.key);
      if (td) {
        const row = td.parentElement;
        if (row) {
          const refTd = row.children[newIndex];
          if (refTd && refTd !== td) {
            row.insertBefore(td, refTd);
          } else if (!refTd) {
            row.appendChild(td);
          }
        }
      }
    });
  });

  // Обновляем ширину
  states.forEach((state, i) => {
    const col = colgroup.querySelectorAll('col')[i];
    if (col) {
      col.style.width = `${state.width}px`;
    }
  });
}

// --- Resize колонок (как в эталонном проекте) ---

let resizeColIndex: number | null = null;
let resizeStartX = 0;
let resizeStartWidth = 0;

function initColumnResize(headerRow: HTMLTableRowElement, states: ColumnState[]) {
  const ths = headerRow.querySelectorAll<HTMLTableHeaderCellElement>('th');

  ths.forEach((th, index) => {
    // Создаём ползунок resize как в эталонном проекте
    const resizer = document.createElement('button');
    resizer.className = 'column-resizer';
    resizer.dataset.columnIndex = String(index);
    th.appendChild(resizer);

    resizer.addEventListener('pointerdown', (event) => {
      event.preventDefault();

      resizeColIndex = index;
      resizeStartX = event.clientX;
      resizeStartWidth = states[index].width;

      document.body.classList.add('is-resizing-column');
      resizer.setPointerCapture(event.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (resizeColIndex === null) return;

        const colDef = COLUMNS.find((c) => c.key === states[resizeColIndex!].key);
        const minWidth = colDef?.minWidth || 50;
        const delta = moveEvent.clientX - resizeStartX;
        const newWidth = Math.max(minWidth, resizeStartWidth + delta);

        states[resizeColIndex!].width = newWidth;

        const colgroup = document.querySelector('colgroup');
        if (colgroup) {
          const col = colgroup.querySelectorAll('col')[resizeColIndex!];
          if (col) {
            col.style.width = `${newWidth}px`;
          }
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
    .map((state) => `<col style="width:${state.width}px">`)
    .join('');

  const headerHtml = columnStates
    .map((state, index) => {
      const colDef = COLUMNS.find((c) => c.key === state.key);
      const className = colDef?.className ? ` class="${colDef.className}"` : '';
      return `<th${className} data-col-key="${state.key}">
        <span class="th-text">${escapeHtml(colDef?.title || state.key)}</span>
        ${index < columnStates.length - 1 ? '<button class="column-resizer" data-column-index="' + index + '"></button>' : ''}
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

  initColumnDrag(headerRow, states);
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