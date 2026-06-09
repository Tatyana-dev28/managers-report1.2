import {
  getBitrixUsers,
  getMetrics,
  getSystemReport,
  getSavedMetricSettings,
} from './api';
import { getBitrixAuth } from './bitrix';
import type {
  BitrixAuthPayload,
  BitrixUser,
  EmployeeSystemReport,
  Metric,
  MetricSettings,
  SystemReport,
} from './types';
import logoUrl from './assets/sapp-logo.svg';

type DateFilterValue =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'exact'
  | 'range';

type AppState = {
  auth: BitrixAuthPayload | null;
  metrics: Metric[];
  users: BitrixUser[];
  selectedUserIds: number[];
  openedUserIds: number[];
  dateFilter: DateFilterValue;
  exactDate: string;
  rangeFrom: string;
  rangeTo: string;
  dateFrom: string;
  dateTo: string;
  report: SystemReport | null;
  loading: boolean;
  reportLoading: boolean;
  error: string | null;
  statusMessage: string;
  metricSettings: MetricSettings | null;
};

const app = document.querySelector<HTMLDivElement>('#app');

const DATE_FILTER_OPTIONS: { value: DateFilterValue; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'this_week', label: 'Текущая неделя' },
  { value: 'last_week', label: 'Прошлая неделя' },
  { value: 'this_month', label: 'Текущий месяц' },
  { value: 'last_month', label: 'Прошлый месяц' },
  { value: 'exact', label: 'Точная дата' },
  { value: 'range', label: 'Диапазон' },
];

const initialRange = getPresetDateRange('yesterday');

const state: AppState = {
  auth: null,
  metrics: [],
  users: [],
  selectedUserIds: [],
  openedUserIds: [],
  dateFilter: 'yesterday',
  exactDate: getToday(),
  rangeFrom: initialRange.from,
  rangeTo: initialRange.to,
  dateFrom: initialRange.from,
  dateTo: initialRange.to,
  report: null,
  loading: false,
  reportLoading: false,
  error: null,
  statusMessage: 'Инициализация приложения...',
  metricSettings: null,
};

export async function startApp() {
  if (!app) return;

  render();
  await runWithState(async () => {
    const [auth, metrics] = await Promise.all([
      getBitrixAuth(),
      getMetrics(),
    ]);

    state.auth = auth;
    state.metrics = metrics;
    state.statusMessage = 'Получаем сотрудников из Битрикс24...';
    render();

    const [users, savedSettings] = await Promise.all([
      getBitrixUsers(auth),
      getSavedMetricSettings(auth),
    ]);
    state.users = users;
    state.metricSettings = savedSettings;

    state.statusMessage = 'Выберите фильтры и сотрудников для формирования отчета.';
  });
}

async function runWithState(action: () => Promise<void>) {
  state.loading = true;
  state.error = null;
  render();

  try {
    await action();
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Неизвестная ошибка';
    state.statusMessage = state.error;
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  if (!app) return;

  app.innerHTML = `
    <div class="app-frame">
      <header class="topbar">
        <div class="brand">
          <a class="brand-link" href="https://sapp24.com/?utm_source=app-b24" target="_blank" rel="noopener noreferrer" aria-label="САПП">
            <img src="${logoUrl}" alt="САПП" class="brand-logo">
          </a>
          <h1>Ежедневный отчет менеджера</h1>
        </div>
        <a class="help-button" href="https://sapp24.com/apps/help/" target="_blank" rel="noopener noreferrer">Помощь</a>
      </header>

      ${renderStatusBar()}

      <main class="layout">
        ${renderToolbar()}
        ${renderReportPanel()}
      </main>
    </div>
  `;

  bindEvents();
}

function renderStatusBar() {
  return `
    <div class="status-strip ${state.loading || state.reportLoading ? 'active' : ''}">
      ${escapeHtml(state.statusMessage)}
    </div>
  `;
}

function renderToolbar() {
  return `
    <section class="toolbar">
      ${renderDateFilter()}
      ${renderEmployeeFilter()}
      <button id="load-report" class="button primary" type="button">Показать отчет</button>
    </section>
  `;
}

function renderDateFilter() {
  return `
    <div class="filter-group date-filter">
      <label class="field-title">Выберите дату</label>
      <div class="dropdown">
        <button type="button" id="date-dropdown-btn" class="dropdown-btn">
          ${getDateFilterLabel(state.dateFilter)}
        </button>
        <div id="date-dropdown-content" class="dropdown-content">
          ${DATE_FILTER_OPTIONS.map(
            (option) => `
              <button
                type="button"
                class="dropdown-option date-option ${state.dateFilter === option.value ? 'selected' : ''}"
                data-value="${option.value}"
              >
                ${option.label}
              </button>
            `,
          ).join('')}
          <div class="exact-date-field ${state.dateFilter === 'exact' ? 'visible' : ''}">
            ${renderDateInput('exact-date', state.exactDate)}
          </div>
          <div class="date-range-fields ${state.dateFilter === 'range' ? 'visible' : ''}">
            ${renderDateInput('range-from', state.rangeFrom)}
            ${renderDateInput('range-to', state.rangeTo)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderEmployeeFilter() {
  const selectedCount = state.selectedUserIds.length;

  return `
    <div class="employee-filter">
      <label class="field-title">Сотрудники</label>
      <details class="employee-filter-details">
        <summary>${selectedCount ? `Выбрано: ${selectedCount}` : 'Выберите сотрудников'}</summary>
        <div class="employee-filter-menu">
          <div class="employee-filter-actions">
            <button id="select-all-users" class="text-button" type="button">Выбрать всех</button>
            <button id="clear-users" class="text-button" type="button">Снять выбор</button>
          </div>
          <div class="employee-options">
            ${state.users.length
              ? state.users.map(renderEmployeeOption).join('')
              : '<div class="empty compact-empty">Сотрудники пока не загружены.</div>'}
          </div>
        </div>
      </details>
    </div>
  `;
}

function renderEmployeeOption(user: BitrixUser) {
  const checked = state.selectedUserIds.includes(user.bitrix_user_id);

  return `
    <label class="employee-option">
      <input type="checkbox" value="${user.bitrix_user_id}" ${checked ? 'checked' : ''}>
      <span>${escapeHtml(user.full_name)}</span>
    </label>
  `;
}

function renderDateInput(id: string, isoValue: string) {
  const [year, month] = isoValue.split('-');
  return `
    <div class="date-input-wrap">
      <input id="${id}" class="date-text-input" type="text" inputmode="numeric" value="${isoToDisplayDate(isoValue)}">
      <button type="button" class="calendar-button" data-target="${id}" aria-label="Открыть календарь">▦</button>
      <div id="${id}-calendar" class="calendar-popup" style="display:none" data-year="${year}" data-month="${month}">
        <div class="calendar-header">
          <button type="button" class="cal-prev" data-target="${id}">◀</button>
          <span class="cal-title"></span>
          <button type="button" class="cal-next" data-target="${id}">▶</button>
        </div>
        <table class="cal-table">
          <thead>
            <tr><th>Пн</th><th>Вт</th><th>Ср</th><th>Чт</th><th>Пт</th><th>Сб</th><th>Вс</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCalendarBody(targetId: string, year: number, month: number) {
  const container = document.querySelector<HTMLDivElement>(`#${targetId}-calendar`);
  if (!container) return;

  container.dataset.year = String(year);
  container.dataset.month = String(month);

  const title = container.querySelector('.cal-title');
  if (title) {
    const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Окторябрь','Ноябрь','Декабрь'];
    title.textContent = `${months[month - 1]} ${year}`;
  }

  const tbody = container.querySelector('tbody');
  if (!tbody) return;

  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Вс
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Пн=0

  let html = '<tr>';
  for (let i = 0; i < startOffset; i++) {
    html += '<td></td>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const cellIdx = (startOffset + d - 1) % 7;
    if (cellIdx === 0 && d > 1) html += '</tr><tr>';
    html += `<td><button type="button" class="cal-day" data-target="${targetId}" data-day="${d}">${d}</button></td>`;
  }
  html += '</tr>';
  tbody.innerHTML = html;
}

function renderReportPanel() {
  return `
    <section class="panel">
      <div class="section-heading">
        <h2>Системные показатели сотрудников</h2>
      </div>
      ${renderReportContent()}
    </section>
  `;
}

function renderReportContent() {
  if (!state.auth) {
    return '<div class="empty">Откройте приложение внутри Битрикс24 или передайте временную авторизацию для локальной проверки.</div>';
  }

  if (!state.selectedUserIds.length) {
    return '<div class="empty">Выберите одного или нескольких сотрудников и нажмите “Показать отчет”.</div>';
  }

  if (!state.report) {
    return '<div class="empty">Отчет еще не загружен.</div>';
  }

  if (!state.report.employees.length) {
    return '<div class="empty">За выбранный период данные по выбранным сотрудникам не найдены.</div>';
  }

  return `
    <div class="report-stack">
      ${state.report.employees.map(renderEmployeeReport).join('')}
    </div>
  `;
}

function renderEmployeeReport(employee: EmployeeSystemReport) {
  const isOpen = state.openedUserIds.includes(employee.bitrix_user_id);

  return `
    <section class="employee-report">
      <button class="employee-header ${isOpen ? 'active' : ''}" type="button" data-user="${employee.bitrix_user_id}">
        <span>${escapeHtml(employee.full_name)}</span>
      </button>
      ${isOpen ? renderEmployeeMetrics(employee) : ''}
    </section>
  `;
}

function renderEmployeeMetrics(employee: EmployeeSystemReport) {
  return `
    <div class="table-wrap">
      <table>
        <colgroup>
          <col class="metric-title-col">
          <col class="system-value-col">
        </colgroup>
        <thead>
          <tr>
            <th>Показатель</th>
            <th class="number-col">Данные системы</th>
          </tr>
        </thead>
        <tbody>
          ${employee.metrics.map((metric) => `
            <tr>
              <td>${escapeHtml(metric.metric_title)}</td>
              <td class="number-col">${formatValue(metric.system_value, metric.is_money)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function bindEvents() {
  // Закрываем dropdown при клике вне
  document.removeEventListener('click', handleOutsideClick);
  document.addEventListener('click', handleOutsideClick);

  // Клик по кнопке фильтра даты
  document.querySelector<HTMLButtonElement>('#date-dropdown-btn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const dropdown = document.querySelector<HTMLElement>('#date-dropdown-content');
    const shouldOpen = !dropdown?.classList.contains('open');
    
    // Закрываем фильтр сотрудников перед открытием фильтра даты
    closeEmployeeDropdown();
    
    if (shouldOpen) {
      dropdown?.classList.add('open');
    } else {
      closeDateDropdown();
    }
  });

  // Открытие фильтра сотрудников
  document.querySelector<HTMLDetailsElement>('.employee-filter-details')?.addEventListener('toggle', (event) => {
    const details = event.currentTarget;
    if (!(details instanceof HTMLDetailsElement)) return;
    
    if (details.open) {
      // Если открываем сотрудников — закрываем фильтр даты
      closeDateDropdown();
    }
  });

  document.querySelector<HTMLElement>('.date-filter')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.querySelector<HTMLElement>('.employee-filter')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.querySelectorAll<HTMLButtonElement>('.date-option').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      state.dateFilter = button.dataset.value as DateFilterValue;
      if (state.dateFilter === 'exact' || state.dateFilter === 'range') {
        render();
        document.querySelector<HTMLElement>('#date-dropdown-content')?.classList.add('open');
        return;
      }

      closeDateDropdown();
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>('.employee-option input').forEach((input) => {
    input.addEventListener('change', () => {
      const userId = Number(input.value);
      state.selectedUserIds = input.checked
        ? [...state.selectedUserIds, userId]
        : state.selectedUserIds.filter((id) => id !== userId);
      state.openedUserIds = state.openedUserIds.filter((id) => state.selectedUserIds.includes(id));
      state.report = null;
      render();
    });
  });

  document.querySelector<HTMLButtonElement>('#select-all-users')?.addEventListener('click', () => {
    state.selectedUserIds = state.users.map((user) => user.bitrix_user_id);
    state.report = null;
    render();
  });

  document.querySelector<HTMLButtonElement>('#clear-users')?.addEventListener('click', () => {
    state.selectedUserIds = [];
    state.openedUserIds = [];
    state.report = null;
    render();
  });

  // Кастомный календарь: открытие/закрытие popup
  document.querySelectorAll<HTMLButtonElement>('.calendar-button').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = button.dataset.target;
      if (!targetId) return;

      // Закрыть все другие календари
      document.querySelectorAll('.calendar-popup').forEach((p) => {
        if (p.id !== `${targetId}-calendar`) {
          (p as HTMLElement).style.display = 'none';
        }
      });

      const popup = document.querySelector<HTMLDivElement>(`#${targetId}-calendar`);
      if (!popup) return;

      const isVisible = popup.style.display !== 'none';
      popup.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        const textInput = document.querySelector<HTMLInputElement>(`#${targetId}`);
        const displayValue = textInput?.value || '';
        const iso = displayToIsoDate(displayValue);
        const [y, m] = iso.split('-');
        renderCalendarBody(targetId, Number(y), Number(m || '1'));
      }
    });
  });

  // Навигация по месяцам
  document.querySelectorAll<HTMLButtonElement>('.cal-prev').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.target;
      if (!targetId) return;
      const popup = document.querySelector<HTMLDivElement>(`#${targetId}-calendar`);
      if (!popup) return;
      const y = Number(popup.dataset.year);
      const m = Number(popup.dataset.month);
      const newM = m === 1 ? 12 : m - 1;
      const newY = m === 1 ? y - 1 : y;
      renderCalendarBody(targetId, newY, newM);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.cal-next').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.target;
      if (!targetId) return;
      const popup = document.querySelector<HTMLDivElement>(`#${targetId}-calendar`);
      if (!popup) return;
      const y = Number(popup.dataset.year);
      const m = Number(popup.dataset.month);
      const newM = m === 12 ? 1 : m + 1;
      const newY = m === 12 ? y + 1 : y;
      renderCalendarBody(targetId, newY, newM);
    });
  });

  // Выбор дня в календаре (обработчик через делегирование)
  document.querySelectorAll<HTMLDivElement>('.calendar-popup').forEach((popup) => {
    popup.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('cal-day')) return;
      e.stopPropagation();

      const targetId = target.dataset.target;
      if (!targetId) return;
      const day = target.dataset.day;
      const y = popup.dataset.year;
      const m = popup.dataset.month;
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const textInput = document.querySelector<HTMLInputElement>(`#${targetId}`);
      if (textInput) {
        textInput.value = isoToDisplayDate(iso);
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      popup.style.display = 'none';
    });
  });

  // Закрыть календарь при клике вне его
  document.addEventListener('click', () => {
    document.querySelectorAll('.calendar-popup').forEach((p) => {
      (p as HTMLElement).style.display = 'none';
    });
  });

  document.querySelector<HTMLButtonElement>('#load-report')?.addEventListener('click', () => {
    void loadReport();
  });

  document.querySelectorAll<HTMLButtonElement>('.employee-header').forEach((button) => {
    button.addEventListener('click', () => {
      const userId = Number(button.dataset.user);
      state.openedUserIds = state.openedUserIds.includes(userId)
        ? state.openedUserIds.filter((id) => id !== userId)
        : [...state.openedUserIds, userId];
      render();
    });
  });
}

async function loadReport() {
  if (!state.auth) return;

  applyDateFilter();
  if (!state.selectedUserIds.length) {
    state.error = 'Выберите хотя бы одного сотрудника.';
    state.statusMessage = 'Отчет не сформирован: сотрудники не выбраны.';
    render();
    return;
  }

  state.reportLoading = true;
  state.statusMessage = 'Собираем системные показатели из Битрикс24...';
  render();

  await runWithState(async () => {
    state.report = await getSystemReport({
      auth: state.auth!,
      date_from: state.dateFrom,
      date_to: state.dateTo,
      bitrix_user_ids: state.selectedUserIds,
      settings: state.metricSettings,
    });
    state.openedUserIds = state.report.employees.map((employee) => employee.bitrix_user_id);
    state.statusMessage = `Системные показатели загружены за период ${isoToDisplayDate(state.dateFrom)} - ${isoToDisplayDate(state.dateTo)}.`;
  });
  if (state.error) {
    state.statusMessage = 'Не удалось загрузить системные показатели. Проверьте подключение и попробуйте снова.';
  }
  state.reportLoading = false;
  render();
}

function handleOutsideClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Node)) return;

  if (!document.querySelector('.date-filter')?.contains(target)) {
    closeDateDropdown();
  }

  if (!document.querySelector('.employee-filter')?.contains(target)) {
    closeEmployeeDropdown();
  }
}

function closeDateDropdown() {
  document.querySelector<HTMLElement>('#date-dropdown-content')?.classList.remove('open');
}

function closeEmployeeDropdown() {
  const details = document.querySelector<HTMLDetailsElement>('.employee-filter-details');
  if (details) {
    details.open = false;
  }
}

function applyDateFilter() {
  if (state.dateFilter === 'exact') {
    const date = displayToIsoDate(
      document.querySelector<HTMLInputElement>('#exact-date')?.value || state.exactDate,
    );
    state.exactDate = date;
    state.dateFrom = date;
    state.dateTo = date;
    return;
  }

  if (state.dateFilter === 'range') {
    const from = displayToIsoDate(
      document.querySelector<HTMLInputElement>('#range-from')?.value || state.rangeFrom,
    );
    const to = displayToIsoDate(
      document.querySelector<HTMLInputElement>('#range-to')?.value || state.rangeTo,
    );
    state.rangeFrom = from;
    state.rangeTo = to;
    state.dateFrom = from;
    state.dateTo = to;
    return;
  }

  const range = getPresetDateRange(state.dateFilter);
  state.dateFrom = range.from;
  state.dateTo = range.to;
}

function getPresetDateRange(value: DateFilterValue) {
  const today = new Date();
  const todayIso = toIsoDate(today);

  if (value === 'today') {
    return { from: todayIso, to: todayIso };
  }

  if (value === 'yesterday') {
    const yesterday = addDays(today, -1);
    const yesterdayIso = toIsoDate(yesterday);
    return { from: yesterdayIso, to: yesterdayIso };
  }

  if (value === 'this_week') {
    const start = startOfWeek(today);
    return { from: toIsoDate(start), to: toIsoDate(addDays(start, 6)) };
  }

  if (value === 'last_week') {
    const start = addDays(startOfWeek(today), -7);
    return { from: toIsoDate(start), to: toIsoDate(addDays(start, 6)) };
  }

  if (value === 'this_month') {
    return {
      from: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toIsoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }

  if (value === 'last_month') {
    return {
      from: toIsoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }

  return { from: todayIso, to: todayIso };
}

function getDateFilterLabel(value: DateFilterValue) {
  return DATE_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? 'Вчера';
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getToday() {
  return toIsoDate(new Date());
}

function isoToDisplayDate(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function displayToIsoDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return trimmed;

  const [, rawDay, rawMonth, year] = match;
  return `${year}-${rawMonth.padStart(2, '0')}-${rawDay.padStart(2, '0')}`;
}

function formatValue(value: string, isMoney: boolean) {
  const numberValue = Number(value);
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: isMoney ? 2 : 0,
    maximumFractionDigits: isMoney ? 2 : 0,
  }).format(Number.isNaN(numberValue) ? 0 : numberValue);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}