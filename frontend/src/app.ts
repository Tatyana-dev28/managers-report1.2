import {
  authMe,
  createSubmission,
  getMetrics,
  getMySubmissions,
  getPlans,
  getReportAssignees,
  getReport,
  getUsers,
  saveReportAssignees,
  savePlans,
} from './api';
import { getBitrixAuthUser } from './bitrix';
import type { EmployeeReport, Metric, Plan, Report, ReportAssignees, Submission, User } from './types';
import logoUrl from './assets/sapp-logo.svg';

type AppState = {
  metrics: Metric[];
  users: User[];
  selectedUser: User | null;
  dateFrom: string;
  dateTo: string;
  leaderDateFilter: string;
  leaderExactDate: string;
  leaderRangeFrom: string;
  leaderRangeTo: string;
  report: Report | null;
  reportAssignees: ReportAssignees | null;
  submissions: Submission[];
  plans: Plan[];
  planYear: number;
  planMonth: number;
  openedPlanBitrixUserIds: number[];
  openedReportBitrixUserIds: number[];
  view: 'main' | 'plans';
  loading: boolean;
  error: string | null;
  notice: string | null;
};

const state: AppState = {
  metrics: [],
  users: [],
  selectedUser: null,
  dateFrom: getYesterday(),
  dateTo: getYesterday(),
  leaderDateFilter: 'yesterday',
  leaderExactDate: getYesterday(),
  leaderRangeFrom: getYesterday(),
  leaderRangeTo: getYesterday(),
  report: null,
  reportAssignees: null,
  submissions: [],
  plans: [],
  planYear: new Date().getFullYear(),
  planMonth: new Date().getMonth() + 1,
  openedPlanBitrixUserIds: [],
  openedReportBitrixUserIds: [],
  view: 'main',
  loading: false,
  error: null,
  notice: null,
};

const app = document.querySelector<HTMLDivElement>('#app');

const DATE_FILTER_OPTIONS = [
  { value: 'any', label: 'Любая дата' },
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'this_week', label: 'Текущая неделя' },
  { value: 'last_week', label: 'Прошлая неделя' },
  { value: 'this_month', label: 'Текущий месяц' },
  { value: 'last_month', label: 'Прошлый месяц' },
  { value: 'exact', label: 'Точная дата' },
  { value: 'range', label: 'Диапазон' },
] as const;

export async function startApp() {
  if (!app) return;
  await runWithState(async () => {
    const [metrics, authPayload] = await Promise.all([getMetrics(), getBitrixAuthUser()]);
    const currentUser = await authMe(authPayload);
    const users = currentUser.role === 'leader' ? await getUsers() : [currentUser];
    const reportAssignees = currentUser.role === 'leader' ? await getReportAssignees() : null;
    state.metrics = metrics;
    state.users = users;
    state.reportAssignees = reportAssignees;
    state.selectedUser = currentUser;
    await loadCurrentViewData();
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
  } finally {
    state.loading = false;
    render();
  }
}

async function loadCurrentViewData() {
  if (!state.selectedUser) return;

  if (state.selectedUser.role === 'leader') {
    if (state.view === 'plans') {
      state.plans = await getPlans(state.planYear, state.planMonth);
    } else {
      state.report = await getReport(state.dateFrom, state.dateTo);
    }
    return;
  }

  const today = getToday();
  state.dateFrom = today;
  state.dateTo = today;
  state.submissions = await getMySubmissions(
    state.selectedUser.bitrix_user_id,
    state.dateFrom,
    state.dateTo,
  );
}

function render() {
  if (!app) return;

  app.innerHTML = `
    <div class="app-frame">
      <header class="topbar">
        <div class="brand">
          <img src="${logoUrl}" alt="САПП" class="brand-logo">
          <h1>Ежедневный отчет менеджера</h1>
        </div>
      </header>

      ${state.error ? `<div class="alert error">${escapeHtml(state.error)}</div>` : ''}
      ${state.notice ? `<div class="alert success">${escapeHtml(state.notice)}</div>` : ''}
      ${state.loading ? '<div class="loader">Загрузка данных...</div>' : ''}

      ${renderContent()}
    </div>
  `;

  bindCommonEvents();
}

function renderContent() {
  if (!state.selectedUser) {
    return '<main class="empty">Пользователь не определен. Открой приложение внутри Битрикс24 или укажи bitrix_user_id для локальной проверки.</main>';
  }

  if (state.selectedUser.role === 'leader') {
    return state.view === 'plans' ? renderPlansPage() : renderLeaderPage();
  }

  return renderManagerPage();
}

function renderLeaderDateFilter() {
  const selectedLabel = getDateFilterLabel(state.leaderDateFilter);

  return `
    <section class="toolbar">
      <div class="filter-group date-filter" data-selected-value="${state.leaderDateFilter}">
        <label class="title-filters">Выберите дату</label>
        <div class="dropdown">
          <button type="button" id="leader-date-dropdown-btn" class="dropdown-btn date-dropdown-btn">
            ${selectedLabel}
          </button>
          <div id="leader-date-dropdown-content" class="dropdown-content">
            ${DATE_FILTER_OPTIONS.map(
              (option) => `
                <button type="button" class="date-option ${state.leaderDateFilter === option.value ? 'selected' : ''}" data-value="${option.value}">
                  ${option.label}
                </button>
              `,
            ).join('')}
            <div class="exact-date-field ${state.leaderDateFilter === 'exact' ? 'visible' : ''}">
              ${renderDatePickerField('leader-exact-date', state.leaderExactDate, 'exact-date')}
            </div>
            <div class="date-range-fields ${state.leaderDateFilter === 'range' ? 'visible' : ''}">
              ${renderDatePickerField('leader-range-from', state.leaderRangeFrom, 'date-from')}
              ${renderDatePickerField('leader-range-to', state.leaderRangeTo, 'date-to')}
            </div>
          </div>
        </div>
      </div>
      <button id="reload-data" class="button primary" type="button">Обновить</button>
    </section>
  `;
}

function renderDatePickerField(id: string, isoValue: string, className: string) {
  return `
    <div class="date-picker-field">
      <input id="${id}" class="${className} date-input" type="text" inputmode="numeric" placeholder="дд.мм.гггг" value="${isoToDisplayDate(isoValue)}">
      <input id="${id}-native" class="native-date-input" type="date" value="${isoValue}" tabindex="-1" aria-hidden="true">
      <button type="button" class="calendar-button" data-target="${id}" aria-label="Открыть календарь">
        <span aria-hidden="true">▦</span>
      </button>
    </div>
  `;
}

function renderManagerPage() {
  return `
    <main class="layout manager-layout">
      <section class="panel">
        <div class="section-heading manager-form-heading">
          <h2>Данные от менеджера</h2>
          <p>После отправки форма очистится, а значения попадут в ручные отправки.</p>
        </div>
        <form id="submission-form">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Показатель</th>
                  <th class="number-col">Данные от менеджера</th>
                </tr>
              </thead>
              <tbody>
                ${state.metrics
                  .map(
                    (metric) => `
                      <tr>
                        <td>${metric.title}</td>
                        <td class="number-col input-col">
                          <input
                            class="metric-input"
                            data-metric="${metric.code}"
                            data-is-money="${metric.is_money}"
                            type="number"
                            min="0"
                            step="${metric.is_money ? '0.01' : '1'}"
                            inputmode="${metric.is_money ? 'decimal' : 'numeric'}"
                            placeholder="0"
                            required
                          >
                        </td>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <div class="actions">
            <button class="button primary" type="submit">Отправить</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-heading submissions-heading">
          <h2>Мои ручные отправки</h2>
        </div>
        ${renderSubmissions()}
      </section>
    </main>
  `;
}

function renderSubmissions() {
  if (!state.submissions.length) {
    return '<div class="empty">Отправок за сегодняшний день нет.</div>';
  }

  return `
    <div class="submission-list">
      ${state.submissions
        .map(
          (submission) => `
            <details class="submission-item">
              <summary>
                <span>${formatSlot(submission.slot)}</span>
                <span>${formatDateTime(submission.submitted_at)}</span>
              </summary>
              <div class="table-wrap compact">
                <table>
                  <tbody>
                    ${submission.values
                      .map((value) => {
                        const metric = state.metrics.find((item) => item.code === value.metric_code);
                        return `
                          <tr>
                            <td>${metric?.title ?? value.metric_code}</td>
                            <td class="number-col">${formatApiValue(value.value, metric?.is_money ?? false)}</td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            </details>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderLeaderPage() {
  return `
    <main class="layout report-layout">
      <section class="leader-tabs">
        <button class="tab active" type="button">Отчет</button>
        <button id="open-plans" class="tab" type="button">Планы</button>
      </section>
      ${renderLeaderDateFilter()}
      <section class="panel">
        <div class="section-heading report-heading">
          <h2>Показатели сотрудников</h2>
        </div>
        ${renderReportTable()}
      </section>
    </main>
  `;
}

function renderReportTable() {
  if (!state.report?.employees.length) {
    return '<div class="empty">Выберите сотрудников для отчета во вкладке “Планы”.</div>';
  }

  return `
    <div class="report-stack">
      ${state.report.employees.map(renderEmployeeReport).join('')}
    </div>
  `;
}

function renderEmployeeReport(employee: EmployeeReport) {
  const isOpen = state.openedReportBitrixUserIds.includes(employee.bitrix_user_id);
  const planLabels = getReportPlanLabels();

  return `
    <section class="employee-report">
      <button class="employee-header ${isOpen ? 'active' : ''}" type="button" data-user="${employee.bitrix_user_id}">
        <span class="employee-name">${employee.full_name}</span>
      </button>
      ${isOpen ? `<div class="table-wrap report-details">
        <table>
          <colgroup>
            <col class="indicator-col">
            <col class="report-number-col">
            <col class="report-number-col">
            <col class="report-number-col">
            <col class="report-number-col">
            <col class="report-status-col">
          </colgroup>
          <thead>
            <tr>
              <th>Показатель</th>
              <th class="number-col">Менеджер</th>
              <th class="number-col">Система</th>
              <th class="number-col">Расхождение</th>
              <th class="number-col">${planLabels.plan}</th>
              <th>${planLabels.status}</th>
            </tr>
          </thead>
          <tbody>
            ${employee.metrics
              .map((metric) => {
                return `
                  <tr>
                    <td>${metric.metric_title}</td>
                    <td class="number-col">${formatApiValue(metric.manager_value, metric.is_money)}</td>
                    <td class="number-col">${formatApiValue(metric.system_value, metric.is_money)}</td>
                    <td class="number-col">${formatApiValue(metric.difference, metric.is_money)}</td>
                    <td class="number-col">${formatApiValue(metric.plan_value, metric.is_money)}</td>
                    <td><span class="plan-status ${metric.plan_status}">${formatPlanStatus(metric.plan_status)}</span></td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>` : ''}
    </section>
  `;
}

function renderPlansPage() {
  const managerUsers = getPlanUsers();
  const openedPlanUserIds = new Set(state.openedPlanBitrixUserIds);

  return `
    <main class="layout plans-layout">
      <section class="leader-tabs">
        <button id="open-report" class="tab" type="button">Отчет</button>
        <button class="tab active" type="button">Планы</button>
      </section>
      <section class="toolbar">
        <label class="field">
          <span>Год</span>
          <input id="plan-year" type="number" min="2000" value="${state.planYear}">
        </label>
        <label class="field">
          <span>Месяц</span>
          <input id="plan-month" type="number" min="1" max="12" value="${state.planMonth}">
        </label>
        <button id="reload-plans" class="button primary" type="button">Обновить</button>
        ${renderReportAssigneeSettings()}
      </section>
      <section class="panel">
        <div class="section-heading">
          <h2>Плановые показатели</h2>
          <p>Планы задаются на день и месяц для каждого сотрудника.</p>
        </div>
        <div class="plan-employee-list">
          ${managerUsers.length
            ? managerUsers
                .map(
                  (user) => `
                    <div class="plan-employee-item">
                      <button
                        class="plan-employee-button ${openedPlanUserIds.has(user.bitrix_user_id) ? 'active' : ''}"
                        type="button"
                        data-user="${user.bitrix_user_id}"
                      >
                        ${getUserName(user)}
                      </button>
                      ${openedPlanUserIds.has(user.bitrix_user_id) ? renderPlanForm(user) : ''}
                    </div>
                  `,
                )
                .join('')
            : '<div class="empty">Выберите сотрудников для отчета в фильтре справа.</div>'}
        </div>
      </section>
    </main>
  `;
}

function renderReportAssigneeSettings() {
  const assignees = state.reportAssignees;
  if (!assignees) return '';

  const selectedIds = new Set(assignees.selected_bitrix_user_ids);

  return `
    <div class="assignees-dropdown">
      <details class="assignees-details">
        <summary>
          <span>Сотрудники для отчета</span>
        </summary>
        <form id="report-assignees-form" class="assignees-form">
          <div class="assignee-list">
            ${assignees.available_users
              .map(
                (user) => `
                  <label class="assignee-option">
                    <input
                      type="checkbox"
                      value="${user.bitrix_user_id}"
                      ${selectedIds.has(user.bitrix_user_id) ? 'checked' : ''}
                    >
                    <span>${getUserName(user)}</span>
                  </label>
                `,
              )
              .join('')}
          </div>
          <div class="actions compact-actions">
            <button class="button primary" type="submit">Сохранить сотрудников</button>
          </div>
        </form>
      </details>
    </div>
  `;
}

function getPlanUsers() {
  const assignees = state.reportAssignees;
  if (!assignees) {
    return [];
  }

  if (!assignees.selected_bitrix_user_ids.length) {
    return [];
  }

  const selectedIds = new Set(assignees.selected_bitrix_user_ids);
  return assignees.available_users.filter((user) => selectedIds.has(user.bitrix_user_id));
}

function renderPlanForm(user: User) {
  return `
    <form class="plans-form plan-employee-form">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Показатель</th>
              <th class="number-col">План на день</th>
              <th class="number-col">План на месяц</th>
            </tr>
          </thead>
          <tbody>
            ${state.metrics
              .map((metric) => {
                const plan = state.plans.find(
                  (item) =>
                    item.bitrix_user_id === user.bitrix_user_id &&
                    item.metric_code === metric.code,
                );

                return `
                  <tr>
                    <td>${metric.title}</td>
                    <td class="number-col plan-input-col">
                      <input
                        class="plan-input"
                        data-user="${user.bitrix_user_id}"
                        data-metric="${metric.code}"
                        data-kind="daily"
                        data-is-money="${metric.is_money}"
                        type="number"
                        min="0"
                        step="${metric.is_money ? '0.01' : '1'}"
                        value="${formatInputValue(plan?.daily_value ?? '0', metric.is_money)}"
                        required
                      >
                    </td>
                    <td class="number-col plan-input-col">
                      <input
                        class="plan-input"
                        data-user="${user.bitrix_user_id}"
                        data-metric="${metric.code}"
                        data-kind="monthly"
                        data-is-money="${metric.is_money}"
                        type="number"
                        min="0"
                        step="${metric.is_money ? '0.01' : '1'}"
                        value="${formatInputValue(plan?.monthly_value ?? '0', metric.is_money)}"
                        required
                      >
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="actions">
        <button class="button primary" type="submit">Сохранить планы</button>
      </div>
    </form>
  `;
}

function bindCommonEvents() {
  document.querySelector<HTMLButtonElement>('#reload-data')?.addEventListener('click', () => {
    if (state.selectedUser?.role === 'leader') {
      applyLeaderDateFilter();
    } else {
      syncPeriodFromInputs();
    }
    state.notice = null;
    void runWithState(loadCurrentViewData);
  });

  document.querySelector<HTMLButtonElement>('#leader-date-dropdown-btn')?.addEventListener('click', () => {
    document.querySelector<HTMLElement>('#leader-date-dropdown-content')?.classList.toggle('open');
  });

  document.querySelectorAll<HTMLButtonElement>('.date-option').forEach((option) => {
    option.addEventListener('click', () => {
      state.leaderDateFilter = option.dataset.value ?? 'any';
      updateLeaderDateDropdownDom();
    });
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

  document.querySelector<HTMLButtonElement>('#open-plans')?.addEventListener('click', () => {
    state.view = 'plans';
    state.openedPlanBitrixUserIds = [];
    state.notice = null;
    void runWithState(loadCurrentViewData);
  });

  document.querySelector<HTMLButtonElement>('#open-report')?.addEventListener('click', () => {
    state.view = 'main';
    state.openedReportBitrixUserIds = [];
    state.notice = null;
    void runWithState(loadCurrentViewData);
  });

  document.querySelector<HTMLButtonElement>('#reload-plans')?.addEventListener('click', () => {
    syncPlanPeriodFromInputs();
    state.notice = null;
    void runWithState(loadCurrentViewData);
  });

  document.querySelectorAll<HTMLButtonElement>('.plan-employee-button').forEach((button) => {
    button.addEventListener('click', () => {
      const bitrixUserId = Number(button.dataset.user);
      state.openedPlanBitrixUserIds = state.openedPlanBitrixUserIds.includes(bitrixUserId)
        ? state.openedPlanBitrixUserIds.filter((id) => id !== bitrixUserId)
        : [...state.openedPlanBitrixUserIds, bitrixUserId];
      state.notice = null;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.employee-header').forEach((button) => {
    button.addEventListener('click', () => {
      const bitrixUserId = Number(button.dataset.user);
      state.openedReportBitrixUserIds = state.openedReportBitrixUserIds.includes(bitrixUserId)
        ? state.openedReportBitrixUserIds.filter((id) => id !== bitrixUserId)
        : [...state.openedReportBitrixUserIds, bitrixUserId];
      render();
    });
  });

  document.querySelectorAll<HTMLInputElement>('.metric-input, .plan-input').forEach((input) => {
    input.addEventListener('change', () => normalizeNumericInput(input));
  });

  document.querySelector<HTMLFormElement>('#submission-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;
    void submitManagerForm();
  });

  document.querySelectorAll<HTMLFormElement>('.plans-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const allPlanForms = Array.from(document.querySelectorAll<HTMLFormElement>('.plans-form'));
      if (!allPlanForms.every((item) => item.reportValidity())) return;
      void submitPlansForm();
    });
  });

  document.querySelector<HTMLFormElement>('#report-assignees-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitReportAssigneesForm();
  });

}

async function submitManagerForm() {
  if (!state.selectedUser) return;

  const reportDate = getToday();
  const slot = getCurrentSubmissionSlot();
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.metric-input'));
  const values = inputs.map((input) => ({
    metric_code: input.dataset.metric ?? '',
    value: getNormalizedInputValue(input),
  }));

  await runWithState(async () => {
    await createSubmission({
      bitrix_user_id: state.selectedUser!.bitrix_user_id,
      report_date: reportDate,
      slot,
      values,
    });
    state.dateFrom = reportDate;
    state.dateTo = reportDate;
    state.submissions = await getMySubmissions(
      state.selectedUser!.bitrix_user_id,
      state.dateFrom,
      state.dateTo,
    );
    state.notice = 'Данные отправлены. Форма очищена.';
  });
}

async function submitPlansForm() {
  if (!state.selectedUser) return;

  syncPlanPeriodFromInputs();

  const rows = new Map<string, {
    bitrix_user_id: number;
    metric_code: string;
    daily_value: string;
    monthly_value: string;
  }>();

  document.querySelectorAll<HTMLInputElement>('.plan-input').forEach((input) => {
    const bitrixUserId = Number(input.dataset.user);
    const metricCode = input.dataset.metric ?? '';
    const key = `${bitrixUserId}:${metricCode}`;
    const current = rows.get(key) ?? {
      bitrix_user_id: bitrixUserId,
      metric_code: metricCode,
      daily_value: '0',
      monthly_value: '0',
    };

    if (input.dataset.kind === 'daily') {
      current.daily_value = getNormalizedInputValue(input);
    } else {
      current.monthly_value = getNormalizedInputValue(input);
    }

    rows.set(key, current);
  });

  await runWithState(async () => {
    await savePlans({
      created_by_bitrix_user_id: state.selectedUser!.bitrix_user_id,
      plans: Array.from(rows.values()).map((row) => ({
        ...row,
        plan_year: state.planYear,
        plan_month: state.planMonth,
      })),
    });
    state.plans = await getPlans(state.planYear, state.planMonth);
    state.notice = 'Планы сохранены.';
  });
}

async function submitReportAssigneesForm() {
  const selectedIds = Array.from(
    document.querySelectorAll<HTMLInputElement>('#report-assignees-form input[type="checkbox"]:checked'),
  ).map((input) => Number(input.value));

  await runWithState(async () => {
    await saveReportAssignees(selectedIds);
    state.reportAssignees = await getReportAssignees();
    state.users = await getUsers();
    state.openedPlanBitrixUserIds = state.openedPlanBitrixUserIds.filter((id) =>
      selectedIds.includes(id),
    );
    await loadCurrentViewData();
    state.notice = 'Сотрудники для отчета сохранены.';
  });
}

function normalizeNumericInput(input: HTMLInputElement) {
  if (input.dataset.isMoney === 'true' || input.value === '') return;

  input.value = getNormalizedInputValue(input);
}

function getNormalizedInputValue(input: HTMLInputElement) {
  if (input.value === '') return '0';
  if (input.dataset.isMoney === 'true') return input.value;

  const numberValue = Number(input.value);
  if (Number.isNaN(numberValue)) return '0';

  return String(Math.trunc(numberValue));
}

function getCurrentSubmissionSlot() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 16) return 'afternoon';
  return 'evening';
}

function syncPeriodFromInputs() {
  state.dateFrom = displayToIsoDate(
    document.querySelector<HTMLInputElement>('#date-from')?.value || state.dateFrom,
  );
  state.dateTo = displayToIsoDate(
    document.querySelector<HTMLInputElement>('#date-to')?.value || state.dateTo,
  );
}

function applyLeaderDateFilter() {
  if (state.leaderDateFilter === 'exact') {
    const exactDate = displayToIsoDate(
      document.querySelector<HTMLInputElement>('#leader-exact-date')?.value || state.leaderExactDate,
    );
    state.leaderExactDate = exactDate;
    state.dateFrom = exactDate;
    state.dateTo = exactDate;
    return;
  }

  if (state.leaderDateFilter === 'range') {
    const rangeFrom = displayToIsoDate(
      document.querySelector<HTMLInputElement>('#leader-range-from')?.value || state.leaderRangeFrom,
    );
    const rangeTo = displayToIsoDate(
      document.querySelector<HTMLInputElement>('#leader-range-to')?.value || state.leaderRangeTo,
    );
    state.leaderRangeFrom = rangeFrom;
    state.leaderRangeTo = rangeTo;
    state.dateFrom = rangeFrom;
    state.dateTo = rangeTo;
    return;
  }

  const range = getPresetDateRange(state.leaderDateFilter);
  state.dateFrom = range.from;
  state.dateTo = range.to;
}

function getDateFilterLabel(value: string) {
  return DATE_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? 'Любая дата';
}

function getReportPlanLabels() {
  if (state.dateFrom === state.dateTo) {
    return {
      plan: 'План дня',
      status: 'Выполнение',
    };
  }

  if (isFullMonthRange(state.dateFrom, state.dateTo)) {
    return {
      plan: 'План месяца',
      status: 'Выполнение',
    };
  }

  return {
    plan: 'План периода',
    status: 'Выполнение',
  };
}

function updateLeaderDateDropdownDom() {
  const button = document.querySelector<HTMLButtonElement>('#leader-date-dropdown-btn');
  const exactField = document.querySelector<HTMLElement>('.exact-date-field');
  const rangeFields = document.querySelector<HTMLElement>('.date-range-fields');

  if (button) {
    button.textContent = getDateFilterLabel(state.leaderDateFilter);
  }

  document.querySelectorAll<HTMLButtonElement>('.date-option').forEach((option) => {
    option.classList.toggle('selected', option.dataset.value === state.leaderDateFilter);
  });

  exactField?.classList.toggle('visible', state.leaderDateFilter === 'exact');
  rangeFields?.classList.toggle('visible', state.leaderDateFilter === 'range');
}

function getPresetDateRange(value: string) {
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
    const end = addDays(start, 6);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }

  if (value === 'last_week') {
    const thisWeekStart = startOfWeek(today);
    const start = addDays(thisWeekStart, -7);
    const end = addDays(start, 6);
    return { from: toIsoDate(start), to: toIsoDate(end) };
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

  return { from: '2000-01-01', to: todayIso };
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

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isFullMonthRange(dateFrom: string, dateTo: string) {
  const start = parseIsoDate(dateFrom);
  const end = parseIsoDate(dateTo);
  const firstDay = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0);

  return (
    start.getTime() === firstDay.getTime() &&
    end.getTime() === lastDay.getTime()
  );
}

function syncPlanPeriodFromInputs() {
  state.planYear = Number(document.querySelector<HTMLInputElement>('#plan-year')?.value || state.planYear);
  state.planMonth = Number(document.querySelector<HTMLInputElement>('#plan-month')?.value || state.planMonth);
}

function getToday() {
  return toIsoDate(new Date());
}

function getYesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toIsoDate(date);
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
  const day = rawDay.padStart(2, '0');
  const month = rawMonth.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getUserName(user: User) {
  return user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || `ID ${user.bitrix_user_id}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatSlot(slot: string) {
  const labels: Record<string, string> = {
    morning: 'Утро',
    afternoon: 'День',
    evening: 'Вечер',
  };
  return labels[slot] ?? slot;
}

function formatPlanStatus(status: string) {
  const labels: Record<string, string> = {
    no_plan: 'План не задан',
    not_completed: 'Не выполнено',
    completed: 'Выполнено',
    over_completed: 'Перевыполнено',
  };
  return labels[status] ?? status;
}

function formatApiValue(value: string, isMoney: boolean) {
  const numberValue = Number(value);
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: isMoney ? 2 : 0,
    maximumFractionDigits: isMoney ? 2 : 0,
  }).format(numberValue);
}

function formatInputValue(value: string, isMoney: boolean) {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return '0';
  return isMoney ? numberValue.toFixed(2) : String(Math.trunc(numberValue));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
