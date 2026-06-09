import './style.css';
import type { BitrixAuthPayload } from './types';
import { getBitrixAuth } from './bitrix';
import { getMetricDetail } from './api';
import type { MetricDetailResponse } from './api';
import { getMetricDetailConfig, hasMetricDetail } from './detail-config';
/**
 * Универсальная страница детализации метрик.
 * Открывается через BX24.openApplication() при клике на любую метрику.
 */

type DetailParams = {
  employee_id: string;
  date_from: string;
  date_to: string;
  metric: string;
  metric_title?: string;
};

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

// --- Рендеринг ---

function renderTable(data: MetricDetailResponse, params: DetailParams) {
  const config = getMetricDetailConfig(params.metric);
  const label = params.metric_title || config?.defaultTitle || 'Детализация';
  const columns = config?.columns || [];

  const backButton = '<button class="detail-back-btn" onclick="closeDetail()">← Назад</button>';

  if (data.rows.length === 0) {
    return `
      <div class="detail-container">
        <div class="detail-header">
          ${backButton}
          <h2>${escapeHtml(label)}</h2>
          <p class="detail-period">${escapeHtml(params.date_from)} — ${escapeHtml(params.date_to)}</p>
        </div>
        <div class="detail-empty">
          <p>Нет данных за выбранный период</p>
        </div>
      </div>
    `;
  }

  const colHtml = columns
    .map((col) => `<col style="width:${col.defaultWidth}%">`)
    .join('');

  const headerHtml = columns
    .map((col) => {
      const className = col.className ? ` class="${col.className}"` : '';
      return `<th${className} data-col-key="${col.key}">
        <span class="th-text">${escapeHtml(col.title)}</span>
      </th>`;
    })
    .join('');

  const rowsHtml = data.rows
    .map((row) => {
      const cellsHtml = columns
        .map((col) => {
          const className = col.className ? ` class="${col.className}"` : '';
          return `<td${className}>${col.render(row.columns, row)}</td>`;
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
        <p class="detail-count">Всего: ${data.rows.length}</p>
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
        <h2>Детализация</h2>
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
        <h2>Детализация</h2>
      </div>
      <div class="detail-empty">
        <p>Загрузка данных...</p>
      </div>
    </div>
  `;
}

async function loadDetailData(
  auth: BitrixAuthPayload,
  params: DetailParams,
): Promise<MetricDetailResponse> {
  return getMetricDetail({
    auth,
    metric_code: params.metric,
    employee_id: parseInt(params.employee_id, 10),
    date_from: params.date_from,
    date_to: params.date_to,
    settings: null,
  });
}

/**
 * Делает функцию closeDetail глобально доступной для onclick в HTML-шаблонах.
 */
(window as unknown as Record<string, unknown>).closeDetail = closeDetail;

export async function startDetail(params?: Record<string, string>) {
  const app = document.getElementById('app');
  if (!app) return;

  let detailParams: DetailParams | null = null;

  if (params) {
    detailParams = {
      employee_id: params.employee_id,
      date_from: params.date_from || '',
      date_to: params.date_to || '',
      metric: params.metric,
      metric_title: params.metric_title || undefined,
    };
  }

  if (!detailParams) {
    // Fallback: читаем из URL
    const urlParams = new URLSearchParams(window.location.search);
    const empId = urlParams.get('employee_id');
    const metric = urlParams.get('metric');
    if (empId && metric) {
      detailParams = {
        employee_id: empId,
        date_from: urlParams.get('date_from') || '',
        date_to: urlParams.get('date_to') || '',
        metric: metric,
        metric_title: urlParams.get('metric_title') || undefined,
      };
    }
  }

  if (!detailParams || !detailParams.employee_id || !detailParams.metric) {
    app.innerHTML = renderError('Не переданы параметры для детализации');
    return;
  }

  // Проверяем, поддерживается ли метрика
  if (!hasMetricDetail(detailParams.metric)) {
    app.innerHTML = renderError(`Детализация для метрики "${escapeHtml(detailParams.metric)}" не поддерживается`);
    return;
  }

  app.innerHTML = renderLoading();

  try {
    const auth = await getBitrixAuth();
    const data = await loadDetailData(auth, detailParams);
    app.innerHTML = renderTable(data, detailParams);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    app.innerHTML = renderError(`Ошибка загрузки данных: ${message}`);
  }
}