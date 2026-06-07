import {
  getBitrixUsers,
  getCategories,
  getCrmTypes,
  getMetrics,
  getSavedMetricSettings,
  getStages,
  getSystemReport,
  saveMetricSettings,
} from './api';
import { getBitrixAuth } from './bitrix';
import type {
  BitrixAuthPayload,
  BitrixUser,
  Category,
  CrmType,
  EmployeeSystemReport,
  Metric,
  MetricSettings,
  Stage,
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
  crmTypes: CrmType[];
  dealCategories: Category[];
  meetingStages: Stage[];
  contractStages: Stage[];
  invoiceStages: Stage[];
  saleStages: Stage[];
  settings: MetricSettings;
  settingsOpen: boolean;
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
  crmTypes: [],
  dealCategories: [],
  meetingStages: [],
  contractStages: [],
  invoiceStages: [],
  saleStages: [],
  settings: createEmptySettings(),
  settingsOpen: true,
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
    state.statusMessage = 'Получаем сотрудников и настройки источников из Битрикс24...';
    render();

    const [users, savedSettings, crmTypes, dealCategories] = await Promise.all([
      getBitrixUsers(auth),
      getSavedMetricSettings(auth),
      getCrmTypes(auth),
      getCategories(auth, 2),
    ]);

    state.users = users;
    state.crmTypes = crmTypes;
    state.dealCategories = dealCategories;
    state.settings = savedSettings ?? createEmptySettings();
    state.settingsOpen = !isSettingsComplete(state.settings);
    await reloadStageLists();
    state.statusMessage = state.settingsOpen
      ? 'Заполните настройки источников показателей перед формированием отчета.'
      : 'Выберите фильтры и сотрудников для формирования отчета.';
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
        ${renderSettingsPanel()}
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

function renderSettingsPanel() {
  return `
    <details class="settings-panel" ${state.settingsOpen ? 'open' : ''}>
      <summary>Настройки источников показателей</summary>
      <form id="settings-form" class="settings-form">
        <div class="settings-grid">
          ${renderSelectField(
            'meeting-entity',
            'Смарт-процесс встреч',
            state.settings.meeting_entity_type_id,
            state.crmTypes.map((item) => ({ value: item.entity_type_id, label: item.title })),
          )}
          ${renderSelectField(
            'meeting-held-stage',
            'Стадия проведенной встречи',
            state.settings.meeting_held_stage_ids[0] ?? null,
            state.meetingStages.map((item) => ({ value: item.status_id, label: item.name })),
          )}
          ${renderSelectField(
            'contract-entity',
            'Смарт-процесс договоров',
            state.settings.contract_entity_type_id,
            state.crmTypes.map((item) => ({ value: item.entity_type_id, label: item.title })),
          )}
          ${renderSelectField(
            'contract-sent-stage',
            'Стадия договора “отправлен”',
            state.settings.contract_sent_stage_id,
            state.contractStages.map((item) => ({ value: item.status_id, label: item.name })),
          )}
          ${renderSelectField(
            'contract-signed-stage',
            'Стадия договора “подписан”',
            state.settings.contract_signed_stage_id,
            state.contractStages.map((item) => ({ value: item.status_id, label: item.name })),
          )}
          ${renderSelectField(
            'cold-base-category',
            'Воронка холодной базы',
            state.settings.cold_base_deal_category_id,
            state.dealCategories.map((item) => ({ value: item.id, label: item.name })),
          )}
          ${renderSelectField(
            'sale-category',
            'Воронка продажи',
            state.settings.sale_deal_category_id,
            state.dealCategories.map((item) => ({ value: item.id, label: item.name })),
          )}
          ${renderSelectField(
            'sale-success-stage',
            'Стадия успешной сделки',
            state.settings.sale_success_stage_id,
            state.saleStages.map((item) => ({ value: item.status_id, label: item.name })),
          )}
          ${renderSelectField(
            'invoice-sent-stage',
            'Стадия счета “отправлен”',
            state.settings.invoice_sent_stage_id,
            state.invoiceStages.map((item) => ({ value: item.status_id, label: item.name })),
          )}
          ${renderSelectField(
            'invoice-paid-stage',
            'Стадия счета “оплачен”',
            state.settings.invoice_paid_stage_id,
            state.invoiceStages.map((item) => ({ value: item.status_id, label: item.name })),
          )}
        </div>
        <div class="settings-actions">
          <button class="button primary" type="submit">Сохранить настройки</button>
        </div>
      </form>
    </details>
  `;
}

function renderSelectField(
  id: string,
  label: string,
  selectedValue: string | number | null,
  options: { value: string | number; label: string }[],
) {
  return `
    <label class="settings-field">
      <span>${label}</span>
      <select id="${id}" ${options.length ? '' : 'disabled'}>
        <option value="">Выберите значение</option>
        ${options.map((option) => `
          <option value="${option.value}" ${String(selectedValue ?? '') === String(option.value) ? 'selected' : ''}>
            ${escapeHtml(option.label)}
          </option>
        `).join('')}
      </select>
    </label>
  `;
}

function renderDateInput(id: string, isoValue: string) {
  return `
    <div class="date-input-wrap">
      <input id="${id}" class="date-text-input" type="text" inputmode="numeric" value="${isoToDisplayDate(isoValue)}">
      <input id="${id}-native" class="native-date-input" type="date" value="${isoValue}" tabindex="-1" aria-hidden="true">
      <button type="button" class="calendar-button" data-target="${id}" aria-label="Открыть календарь">▦</button>
    </div>
  `;
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

  if (!isSettingsComplete(state.settings)) {
    return '<div class="empty">Сначала заполните настройки источников показателей.</div>';
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
  document.querySelector<HTMLElement>('.date-filter')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.querySelector<HTMLElement>('.employee-filter')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.querySelector<HTMLButtonElement>('#date-dropdown-btn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const dropdown = document.querySelector<HTMLElement>('#date-dropdown-content');
    const shouldOpen = !dropdown?.classList.contains('open');
    closeDropdowns();
    if (shouldOpen) {
      dropdown?.classList.add('open');
    }
  });

  document.querySelector<HTMLDetailsElement>('.employee-filter-details')?.addEventListener('toggle', (event) => {
    const details = event.currentTarget;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    closeDateDropdown();
  });

  document.querySelector<HTMLDetailsElement>('.settings-panel')?.addEventListener('toggle', (event) => {
    const details = event.currentTarget;
    if (details instanceof HTMLDetailsElement) {
      state.settingsOpen = details.open;
    }
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

  document.querySelectorAll<HTMLButtonElement>('.calendar-button').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.target;
      if (!targetId) return;

      const nativeInput = document.querySelector<HTMLInputElement>(`#${targetId}-native`);
      if (!nativeInput) return;

      if (typeof nativeInput.showPicker === 'function') {
        nativeInput.showPicker();
      } else {
        nativeInput.click();
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('.native-date-input').forEach((input) => {
    input.addEventListener('change', () => {
      const textInputId = input.id.replace(/-native$/, '');
      const textInput = document.querySelector<HTMLInputElement>(`#${textInputId}`);
      if (textInput) {
        textInput.value = isoToDisplayDate(input.value);
      }
    });
  });

  document.querySelector<HTMLFormElement>('#settings-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitSettings();
  });

  document.querySelector<HTMLSelectElement>('#meeting-entity')?.addEventListener('change', (event) => {
    state.settings.meeting_entity_type_id = numberOrNull((event.currentTarget as HTMLSelectElement).value);
    state.settings.meeting_held_stage_ids = [];
    void reloadStageListsAndRender();
  });

  document.querySelector<HTMLSelectElement>('#contract-entity')?.addEventListener('change', (event) => {
    state.settings.contract_entity_type_id = numberOrNull((event.currentTarget as HTMLSelectElement).value);
    state.settings.contract_sent_stage_id = null;
    state.settings.contract_signed_stage_id = null;
    void reloadStageListsAndRender();
  });

  document.querySelector<HTMLSelectElement>('#sale-category')?.addEventListener('change', (event) => {
    state.settings.sale_deal_category_id = numberOrNull((event.currentTarget as HTMLSelectElement).value);
    state.settings.sale_success_stage_id = null;
    void reloadStageListsAndRender();
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

  document.removeEventListener('click', handleOutsideClick);
  document.addEventListener('click', handleOutsideClick);
}

async function submitSettings() {
  if (!state.auth) return;

  collectSettingsFromForm();
  if (!isSettingsComplete(state.settings)) {
    state.statusMessage = 'Заполните все настройки источников показателей.';
    render();
    return;
  }

  await runWithState(async () => {
    state.settings = await saveMetricSettings(state.auth!, state.settings);
    state.settingsOpen = false;
    state.report = null;
    state.statusMessage = 'Настройки источников сохранены в Битрикс24.';
  });
}

async function reloadStageListsAndRender() {
  if (!state.auth) return;
  await runWithState(async () => {
    await reloadStageLists();
    state.statusMessage = 'Списки стадий обновлены. Продолжите настройку источников.';
  });
}

async function reloadStageLists() {
  if (!state.auth) return;

  const tasks: Promise<void>[] = [];

  if (state.settings.meeting_entity_type_id) {
    tasks.push(
      getStages(state.auth, state.settings.meeting_entity_type_id).then((items) => {
        state.meetingStages = items;
      }),
    );
  } else {
    state.meetingStages = [];
  }

  if (state.settings.contract_entity_type_id) {
    tasks.push(
      getStages(state.auth, state.settings.contract_entity_type_id).then((items) => {
        state.contractStages = items;
      }),
    );
  } else {
    state.contractStages = [];
  }

  tasks.push(
    getStages(state.auth, state.settings.invoice_entity_type_id, 0).then((items) => {
      state.invoiceStages = items;
    }),
  );

  if (state.settings.sale_deal_category_id !== null) {
    tasks.push(
      getStages(state.auth, 2, state.settings.sale_deal_category_id).then((items) => {
        state.saleStages = items;
      }),
    );
  } else {
    state.saleStages = [];
  }

  await Promise.all(tasks);
}

async function loadReport() {
  if (!state.auth) return;

  collectSettingsFromForm();
  if (!isSettingsComplete(state.settings)) {
    state.settingsOpen = true;
    state.statusMessage = 'Сначала заполните настройки источников показателей.';
    render();
    return;
  }

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
      settings: state.settings,
    });
    state.openedUserIds = state.report.employees.map((employee) => employee.bitrix_user_id);
    state.statusMessage = `Системные показатели загружены за период ${isoToDisplayDate(state.dateFrom)} - ${isoToDisplayDate(state.dateTo)}.`;
  });
  if (state.error) {
    state.statusMessage = 'Не удалось загрузить системные показатели. Проверьте настройки и попробуйте снова.';
  }
  state.reportLoading = false;
  render();
}

function collectSettingsFromForm() {
  state.settings = {
    meeting_entity_type_id: numberOrNull(getSelectValue('meeting-entity')),
    contract_entity_type_id: numberOrNull(getSelectValue('contract-entity')),
    invoice_entity_type_id: 31,
    cold_base_deal_category_id: numberOrNull(getSelectValue('cold-base-category')),
    sale_deal_category_id: numberOrNull(getSelectValue('sale-category')),
    sale_success_stage_id: stringOrNull(getSelectValue('sale-success-stage')),
    meeting_held_stage_ids: stringOrNull(getSelectValue('meeting-held-stage'))
      ? [String(getSelectValue('meeting-held-stage'))]
      : [],
    contract_sent_stage_id: stringOrNull(getSelectValue('contract-sent-stage')),
    contract_signed_stage_id: stringOrNull(getSelectValue('contract-signed-stage')),
    invoice_sent_stage_id: stringOrNull(getSelectValue('invoice-sent-stage')),
    invoice_paid_stage_id: stringOrNull(getSelectValue('invoice-paid-stage')),
  };
}

function getSelectValue(id: string) {
  return document.querySelector<HTMLSelectElement>(`#${id}`)?.value ?? '';
}

function createEmptySettings(): MetricSettings {
  return {
    meeting_entity_type_id: null,
    contract_entity_type_id: null,
    invoice_entity_type_id: 31,
    cold_base_deal_category_id: null,
    sale_deal_category_id: null,
    sale_success_stage_id: null,
    meeting_held_stage_ids: [],
    contract_sent_stage_id: null,
    contract_signed_stage_id: null,
    invoice_sent_stage_id: null,
    invoice_paid_stage_id: null,
  };
}

function isSettingsComplete(settings: MetricSettings) {
  return Boolean(
    settings.meeting_entity_type_id &&
    settings.contract_entity_type_id &&
    settings.cold_base_deal_category_id !== null &&
    settings.sale_deal_category_id !== null &&
    settings.sale_success_stage_id &&
    settings.meeting_held_stage_ids.length &&
    settings.contract_sent_stage_id &&
    settings.contract_signed_stage_id &&
    settings.invoice_sent_stage_id &&
    settings.invoice_paid_stage_id,
  );
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

function closeDropdowns() {
  closeDateDropdown();
  closeEmployeeDropdown();
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

function numberOrNull(value: string) {
  if (!value) return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function stringOrNull(value: string) {
  return value || null;
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
