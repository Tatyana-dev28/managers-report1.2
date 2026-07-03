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
import { hasMetricDetail } from './detail-config';
import logoUrl from './assets/sapp-logo.svg';

/**
 * Открывает слайдер детализации метрики через BX24.openApplication().
 * Внутри слайдера загружается то же приложение, но с параметрами,
 * по которым main.ts определяет, что нужно показать страницу детализации.
 *
 * @param metricCode - код метрики
 * @param userId - ID сотрудника в Битрикс24
 * @param dateFrom - дата начала периода (ISO, YYYY-MM-DD)
 * @param dateTo - дата окончания периода (ISO, YYYY-MM-DD)
 */
function openMetricDetail(
  metricCode: string,
  userId: number,
  dateFrom: string,
  dateTo: string,
  metricTitle?: string,
): void {
  if (!hasMetricDetail(metricCode)) return;

  const params: Record<string, string> = {
    employee_id: String(userId),
    date_from: dateFrom,
    date_to: dateTo,
    metric: metricCode,
  };
  if (metricTitle) {
    params.metric_title = metricTitle;
  }

  console.log('[MetricDetail] Opening with params:', params);

  if (window.BX24?.openApplication) {
    window.BX24.openApplication(params, function(result?: unknown) {
      console.log('[MetricDetail] Slider closed, result:', result);
    });
  } else {
    // Fallback: открываем в новом окне (для локальной разработки)
    const urlParams = new URLSearchParams(params);
    window.open(`/index.html?${urlParams.toString()}`, '_blank');
  }
}

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
  reportStartedAt: number | null;
  reportElapsedSeconds: number;
  error: string | null;
  statusMessage: string;
  metricSettings: MetricSettings | null;
  employeeSearch: string;
  employeeFilterOpen: boolean;
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
  reportStartedAt: null,
  reportElapsedSeconds: 0,
  error: null,
  statusMessage: 'Инициализация приложения...',
  metricSettings: null,
  employeeSearch: '',
  employeeFilterOpen: false,
};

let reportTimerId: ReturnType<typeof window.setInterval> | null = null;

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
  const showTimer = state.reportLoading || state.reportElapsedSeconds > 0;

  return `
    <div class="status-strip ${state.loading || state.reportLoading ? 'active' : ''}">
      <span class="status-message">${escapeHtml(state.statusMessage)}</span>
      ${showTimer ? `
        <span class="status-timer" aria-label="Время формирования отчета">
          <span class="status-timer-label">Время:</span>
          <span class="status-timer-value">${formatElapsedTime(state.reportElapsedSeconds)}</span>
        </span>
      ` : ''}
    </div>
  `;
}

function renderToolbar() {
  const canDownloadReport = Boolean(state.report?.employees.length);

  return `
    <section class="toolbar">
      ${renderDateFilter()}
      ${renderEmployeeFilter()}
      <button id="load-report" class="button primary" type="button">Показать отчет</button>
      <button id="download-excel" class="button secondary" type="button" ${canDownloadReport ? '' : 'disabled'}>
        Скачать Excel
      </button>
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
  const query = state.employeeSearch.toLowerCase().trim();
  const filteredUsers = query
    ? state.users.filter((user) => user.full_name.toLowerCase().includes(query))
    : state.users;

  return `
    <div class="employee-filter">
      <label class="field-title">Сотрудники</label>
      <details class="employee-filter-details" ${state.employeeFilterOpen ? 'open' : ''}>
        <summary>${selectedCount ? `Выбрано: ${selectedCount}` : 'Выберите сотрудников'}</summary>
        <div class="employee-filter-menu">
          <div class="employee-filter-actions">
            <button id="select-all-users" class="text-button" type="button">Выбрать всех</button>
            <button id="clear-users" class="text-button" type="button">Снять выбор</button>
          </div>
          <div class="employee-filter-search">
            <svg class="search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M10 10L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input
              id="employee-search-input"
              class="employee-search-input"
              type="text"
              placeholder="Поиск сотрудников..."
              value="${escapeHtml(state.employeeSearch)}"
              autocomplete="off"
            >
          </div>
          <div class="employee-options">
            ${filteredUsers.length
              ? filteredUsers.map(renderEmployeeOption).join('')
              : '<div class="empty compact-empty">Сотрудники не найдены.</div>'}
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
    return '<div class="empty">Выберите одного или нескольких сотрудников и нажмите "Показать отчет".</div>';
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
      <button
        class="employee-header ${isOpen ? 'active' : ''}"
        type="button"
        data-user="${employee.bitrix_user_id}"
        aria-expanded="${isOpen}"
      >
        <span class="employee-name">${escapeHtml(employee.full_name)}</span>
        <span class="employee-toggle-icon" aria-hidden="true"></span>
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
          ${employee.metrics.map((metric) => {
            const isDetailAvailable = hasMetricDetail(metric.metric_code);
            const formattedValue = formatValue(metric.system_value, metric.is_money);
            const valueHtml = isDetailAvailable
              ? `<a class="metric-link" href="#" data-metric="${escapeHtml(metric.metric_code)}" data-title="${escapeHtml(metric.metric_title)}" data-user="${employee.bitrix_user_id}" data-from="${escapeHtml(state.dateFrom)}" data-to="${escapeHtml(state.dateTo)}">${formattedValue}</a>`
              : formattedValue;
            return `
            <tr>
              <td>${escapeHtml(metric.metric_title)}</td>
              <td class="number-col">${valueHtml}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/** Обработчик изменения чекбокса сотрудника — обновляет состояние и summary без полного перерендера */
function handleEmployeeCheckboxChange(input: HTMLInputElement) {
  const userId = Number(input.value);
  state.selectedUserIds = input.checked
    ? [...state.selectedUserIds, userId]
    : state.selectedUserIds.filter((id) => id !== userId);
  state.openedUserIds = state.openedUserIds.filter((id) => state.selectedUserIds.includes(id));
  state.report = null;
  // Обновляем текст summary (количество выбранных)
  const summary = document.querySelector<HTMLElement>('.employee-filter-details summary');
  if (summary) {
    const count = state.selectedUserIds.length;
    summary.textContent = count ? `Выбрано: ${count}` : 'Выберите сотрудников';
  }
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
    
    state.employeeFilterOpen = details.open;
    
    if (details.open) {
      // Если открываем сотрудников — закрываем фильтр даты
      closeDateDropdown();
      // Фокусируемся на строке поиска
      setTimeout(() => {
        document.querySelector<HTMLInputElement>('#employee-search-input')?.focus();
      }, 0);
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
      handleEmployeeCheckboxChange(input);
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

  // Поиск сотрудников — обновляем только список, не перерендеривая всю страницу
  document.querySelector<HTMLInputElement>('#employee-search-input')?.addEventListener('input', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    state.employeeSearch = input.value;

    const query = state.employeeSearch.toLowerCase().trim();
    const filteredUsers = query
      ? state.users.filter((user) => user.full_name.toLowerCase().includes(query))
      : state.users;

    const optionsContainer = document.querySelector<HTMLDivElement>('.employee-options');
    if (optionsContainer) {
      optionsContainer.innerHTML = filteredUsers.length
        ? filteredUsers.map(renderEmployeeOption).join('')
        : '<div class="empty compact-empty">Сотрудники не найдены.</div>';
    }

    // Перепривязываем события на чекбоксы внутри обновлённого списка
    optionsContainer?.querySelectorAll<HTMLInputElement>('.employee-option input').forEach((cb) => {
      cb.addEventListener('change', () => {
        handleEmployeeCheckboxChange(cb);
      });
    });
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

  document.querySelector<HTMLButtonElement>('#download-excel')?.addEventListener('click', () => {
    downloadReportExcel();
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

  // Открытие детализации метрики через BX24.openApplication()
  document.querySelectorAll<HTMLAnchorElement>('.metric-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      const metricCode = link.dataset.metric;
      const userId = link.dataset.user;
      const dateFrom = link.dataset.from;
      const dateTo = link.dataset.to;
      const metricTitle = link.dataset.title;

      if (!metricCode || !userId || !dateFrom || !dateTo) {
        console.warn('[MetricLink] Missing data attributes');
        return;
      }

      openMetricDetail(metricCode, parseInt(userId, 10), dateFrom, dateTo, metricTitle);
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
  startReportTimer();
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
    state.statusMessage = `Системные показатели загружены за период ${isoToDisplayDate(state.dateFrom)} - ${isoToDisplayDate(state.dateTo)}.`;
  });
  if (state.error) {
    state.statusMessage = 'Не удалось загрузить системные показатели. Проверьте подключение и попробуйте снова.';
  }
  stopReportTimer();
  state.reportLoading = false;
  render();
}

function downloadReportExcel() {
  if (!state.report) return;

  const period = `${isoToDisplayDate(state.report.date_from)} - ${isoToDisplayDate(state.report.date_to)}`;
  const rows: ExcelCell[][] = [
    [{ value: 'Ежедневный отчет менеджера', type: 'text' }],
    [
      { value: 'Выбранный период', type: 'text' },
      { value: period, type: 'text' },
    ],
    [],
    [
      { value: 'Менеджер', type: 'text' },
      { value: 'Показатель', type: 'text' },
      { value: 'Данные системы', type: 'text' },
    ],
    ...state.report.employees.flatMap((employee) =>
      employee.metrics.map<ExcelCell[]>((metric) => [
        { value: employee.full_name, type: 'text' },
        { value: metric.metric_title, type: 'text' },
        { value: formatExcelValue(metric.system_value, metric.is_money), type: 'number' },
      ]),
    ),
  ];

  const blob = createXlsxBlob(rows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `manager-report-${state.report.date_from}-${state.report.date_to}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type ExcelCell = {
  value: string;
  type: 'text' | 'number';
};

function createXlsxBlob(rows: ExcelCell[][]) {
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Отчет" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    'xl/worksheets/sheet1.xml': createWorksheetXml(rows),
  };

  return createZipBlob(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function createWorksheetXml(rows: ExcelCell[][]) {
  const sheetRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row
      .map((cell, columnIndex) => createCellXml(cell, `${columnName(columnIndex + 1)}${rowNumber}`))
      .join('');

    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:C${Math.max(rows.length, 1)}"/>
  <cols>
    <col min="1" max="1" width="28" customWidth="1"/>
    <col min="2" max="2" width="56" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>
</worksheet>`;
}

function createCellXml(cell: ExcelCell, reference: string) {
  const numberValue = Number(cell.value);
  if (cell.type === 'number' && Number.isFinite(numberValue)) {
    return `<c r="${reference}"><v>${numberValue}</v></c>`;
  }

  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(cell.value)}</t></is></c>`;
}

function columnName(columnNumber: number) {
  let name = '';
  let current = columnNumber;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function createZipBlob(files: Record<string, string>, type: string) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = createZipLocalHeader(nameBytes, data, crc);
    const centralHeader = createZipCentralHeader(nameBytes, data, crc, offset);

    chunks.push(localHeader, nameBytes, data);
    centralDirectory.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  const endRecord = createZipEndRecord(Object.keys(files).length, centralDirectorySize, centralDirectoryOffset);

  const zipBytes = concatUint8Arrays([...chunks, ...centralDirectory, endRecord]);
  return new Blob([zipBytes.buffer as ArrayBuffer], { type });
}

function concatUint8Arrays(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });

  return result;
}

function createZipLocalHeader(nameBytes: Uint8Array, data: Uint8Array, crc: number) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  const { time, date } = getZipDateTime();

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);

  return header;
}

function createZipCentralHeader(nameBytes: Uint8Array, data: Uint8Array, crc: number, offset: number) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  const { time, date } = getZipDateTime();

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);

  return header;
}

function createZipEndRecord(fileCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

function getZipDateTime() {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  return { time, date };
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function startReportTimer() {
  if (reportTimerId) {
    window.clearInterval(reportTimerId);
  }

  state.reportStartedAt = Date.now();
  state.reportElapsedSeconds = 0;
  reportTimerId = window.setInterval(updateReportTimer, 1000);
}

function updateReportTimer() {
  if (!state.reportStartedAt) return;

  state.reportElapsedSeconds = Math.floor((Date.now() - state.reportStartedAt) / 1000);
  const timerValue = document.querySelector<HTMLElement>('.status-timer-value');
  if (timerValue) {
    timerValue.textContent = formatElapsedTime(state.reportElapsedSeconds);
  }
}

function stopReportTimer() {
  updateReportTimer();

  if (reportTimerId) {
    window.clearInterval(reportTimerId);
    reportTimerId = null;
  }

  state.reportStartedAt = null;
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

function formatElapsedTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
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

function formatExcelValue(value: string, isMoney: boolean) {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return value;

  return isMoney ? numberValue.toFixed(2) : String(numberValue);
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
