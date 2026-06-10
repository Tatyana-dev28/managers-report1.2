/**
 * Конфигурация отображения детализации для каждой метрики.
 *
 * Каждая метрика описывает:
 * - Какие колонки показывать в таблице
 * - Как форматировать значения
 * - Заголовок страницы
 */

// Типы данных, которые приходят с бэкенда в columns
// (сырые поля из API Битрикс24)

export type ColumnDef = {
  /** Ключ для доступа к данным в columns */
  key: string;
  /** Заголовок колонки */
  title: string;
  /** Ширина в процентах */
  defaultWidth: number;
  /** Функция форматирования значения */
  render: (columns: Record<string, unknown>, row?: MetricDetailRow) => string;
  /** CSS-класс для th/td */
  className?: string;
};

/** Внутренний тип строки детализации (для render) */
export type MetricDetailRow = {
  columns: Record<string, unknown>;
  employee_name?: string;
};

export type MetricDetailConfig = {
  /** Код метрики */
  metricCode: string;
  /** Заголовок по умолчанию */
  defaultTitle: string;
  /** Колонки таблицы */
  columns: ColumnDef[];
};

// ============================================================
// Утилиты форматирования
// ============================================================

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
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

function formatDuration(seconds: string): string {
  const sec = parseInt(seconds, 10) || 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMoney(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function str(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val);
}

// ============================================================
// Конфигурации метрик
// ============================================================

const CALL_TYPE_LABELS: Record<string, string> = {
  '1': 'Исходящий',
  '2': 'Входящий',
  '3': 'Переадресованный',
  '4': 'Обратный',
};

/** Колонка сотрудника (первая во всех таблицах) */
const EMPLOYEE_COLUMN: ColumnDef = {
  key: 'employee_name',
  title: 'Сотрудник',
  defaultWidth: 18,
  render: (_col, row) => escapeHtml(row?.employee_name || '—'),
};

/** Колонки для звонков (общие для всех 4 метрик звонков) */
const CALL_COLUMNS: ColumnDef[] = [
  EMPLOYEE_COLUMN,
  {
    key: 'PHONE_NUMBER',
    title: 'Номер телефона',
    defaultWidth: 18,
    render: (col) => escapeHtml(str(col['PHONE_NUMBER']) || '—'),
  },
  {
    key: 'CALL_TYPE',
    title: 'Тип звонка',
    defaultWidth: 14,
    render: (col) => CALL_TYPE_LABELS[str(col['CALL_TYPE'])] || str(col['CALL_TYPE']),
  },
  {
    key: 'CALL_START_DATE',
    title: 'Дата и время',
    defaultWidth: 24,
    render: (col) => formatDate(str(col['CALL_START_DATE'])),
  },
  {
    key: 'CALL_DURATION',
    title: 'Длительность',
    defaultWidth: 16,
    className: 'number-col',
    render: (col) => formatDuration(str(col['CALL_DURATION'])),
  },
  {
    key: 'COST',
    title: 'Стоимость',
    defaultWidth: 10,
    className: 'number-col',
    render: (col) => {
      const cost = str(col['COST']);
      return cost ? formatMoney(cost) : '—';
    },
  },
];

/** Колонки для Смарт-процессов (встречи, договоры, счета) */
const SMART_PROCESS_COLUMNS: ColumnDef[] = [
  EMPLOYEE_COLUMN,
  {
    key: 'title',
    title: 'Название',
    defaultWidth: 32,
    render: (col) => escapeHtml(str(col['title']) || '—'),
  },
  {
    key: 'stageId',
    title: 'Стадия',
    defaultWidth: 18,
    render: (col) => escapeHtml(str(col['stageId']) || '—'),
  },
  {
    key: 'createdTime',
    title: 'Дата создания',
    defaultWidth: 18,
    render: (col) => formatDate(str(col['createdTime'])),
  },
  {
    key: 'opportunity',
    title: 'Сумма',
    defaultWidth: 14,
    className: 'number-col',
    render: (col) => {
      const val = str(col['opportunity']);
      return val ? formatMoney(val) : '—';
    },
  },
];

/** Колонки для сделок */
const DEAL_COLUMNS: ColumnDef[] = [
  EMPLOYEE_COLUMN,
  {
    key: 'title',
    title: 'Название сделки',
    defaultWidth: 32,
    render: (col) => escapeHtml(str(col['title']) || '—'),
  },
  {
    key: 'stageId',
    title: 'Стадия',
    defaultWidth: 16,
    render: (col) => escapeHtml(str(col['stageId']) || '—'),
  },
  {
    key: 'opportunity',
    title: 'Бюджет',
    defaultWidth: 14,
    className: 'number-col',
    render: (col) => {
      const val = str(col['opportunity']);
      return val ? formatMoney(val) : '—';
    },
  },
  {
    key: 'createdTime',
    title: 'Дата создания',
    defaultWidth: 20,
    render: (col) => formatDate(str(col['createdTime'])),
  },
];

// ============================================================
// Словарь всех конфигураций
// ============================================================

export const METRIC_DETAIL_CONFIGS: Record<string, MetricDetailConfig> = {
  // --- Звонки ---
  calls_total: {
    metricCode: 'calls_total',
    defaultTitle: 'Все звонки',
    columns: CALL_COLUMNS,
  },
  outgoing_calls: {
    metricCode: 'outgoing_calls',
    defaultTitle: 'Исходящие звонки',
    columns: CALL_COLUMNS,
  },
  successful_outgoing_calls: {
    metricCode: 'successful_outgoing_calls',
    defaultTitle: 'Успешные исходящие',
    columns: CALL_COLUMNS,
  },
  incoming_calls: {
    metricCode: 'incoming_calls',
    defaultTitle: 'Входящие звонки',
    columns: CALL_COLUMNS,
  },
  // --- Встречи ---
  meetings_held: {
    metricCode: 'meetings_held',
    defaultTitle: 'Проведенные встречи',
    columns: SMART_PROCESS_COLUMNS,
  },
  meetings_created: {
    metricCode: 'meetings_created',
    defaultTitle: 'Назначенные встречи',
    columns: SMART_PROCESS_COLUMNS,
  },
  // --- Сделки ---
  new_deals: {
    metricCode: 'new_deals',
    defaultTitle: 'Новые сделки',
    columns: DEAL_COLUMNS,
  },
  commercial_offers_sent: {
    metricCode: 'commercial_offers_sent',
    defaultTitle: 'Отправленные КП',
    columns: DEAL_COLUMNS,
  },
  successful_sale_deals: {
    metricCode: 'successful_sale_deals',
    defaultTitle: 'Успешные сделки (Продажи)',
    columns: DEAL_COLUMNS,
  },
  // --- Договоры ---
  contracts_sent: {
    metricCode: 'contracts_sent',
    defaultTitle: 'Отправленные договоры',
    columns: SMART_PROCESS_COLUMNS,
  },
  contracts_signed: {
    metricCode: 'contracts_signed',
    defaultTitle: 'Подписанные договоры',
    columns: SMART_PROCESS_COLUMNS,
  },
  // --- Счета ---
  invoices_sent: {
    metricCode: 'invoices_sent',
    defaultTitle: 'Отправленные счета',
    columns: SMART_PROCESS_COLUMNS,
  },
  invoices_paid: {
    metricCode: 'invoices_paid',
    defaultTitle: 'Оплаченные счета',
    columns: SMART_PROCESS_COLUMNS,
  },
};

/**
 * Возвращает конфигурацию для метрики или undefined, если метрика не поддерживает детализацию.
 */
export function getMetricDetailConfig(metricCode: string): MetricDetailConfig | undefined {
  return METRIC_DETAIL_CONFIGS[metricCode];
}

/**
 * Проверяет, поддерживает ли метрика детализацию.
 */
export function hasMetricDetail(metricCode: string): boolean {
  return metricCode in METRIC_DETAIL_CONFIGS;
}