import type {
  BitrixAuthPayload,
  BitrixUser,
  Category,
  CrmType,
  Metric,
  MetricSettings,
  Stage,
  SystemReport,
} from './types';

declare global {
  interface Window {
    APP_CONFIG?: {
      API_BASE_URL?: string;
    };
  }
}

const API_BASE_URL = 'https://manager-report.sappapp1b24.ru/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function getErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `Ошибка запроса: ${response.status}`;
  }

  try {
    const payload = JSON.parse(text) as { detail?: unknown };
    if (typeof payload.detail === 'string') {
      return payload.detail;
    }
  } catch {
    return text;
  }

  return text;
}

export function getMetrics(): Promise<Metric[]> {
  return request<Metric[]>('/metrics');
}

export function getBitrixUsers(auth: BitrixAuthPayload): Promise<BitrixUser[]> {
  return request<BitrixUser[]>('/bitrix/users', {
    method: 'POST',
    body: JSON.stringify({ auth }),
  });
}

export function getSavedMetricSettings(auth: BitrixAuthPayload): Promise<MetricSettings | null> {
  return request<MetricSettings | null>('/bitrix/settings/get', {
    method: 'POST',
    body: JSON.stringify({ auth }),
  });
}

export function saveMetricSettings(
  auth: BitrixAuthPayload,
  settings: MetricSettings,
): Promise<MetricSettings> {
  return request<MetricSettings>('/bitrix/settings/save', {
    method: 'POST',
    body: JSON.stringify({ auth, settings }),
  });
}

export function getCrmTypes(auth: BitrixAuthPayload): Promise<CrmType[]> {
  return request<CrmType[]>('/bitrix/crm-types', {
    method: 'POST',
    body: JSON.stringify({ auth }),
  });
}

export function getCategories(auth: BitrixAuthPayload, entityTypeId: number): Promise<Category[]> {
  return request<Category[]>('/bitrix/categories', {
    method: 'POST',
    body: JSON.stringify({ auth, entity_type_id: entityTypeId }),
  });
}

export function getStages(
  auth: BitrixAuthPayload,
  entityTypeId: number,
  categoryId = 0,
): Promise<Stage[]> {
  return request<Stage[]>('/bitrix/stages', {
    method: 'POST',
    body: JSON.stringify({
      auth,
      entity_type_id: entityTypeId,
      category_id: categoryId,
    }),
  });
}

export function getSystemReport(payload: {
  auth: BitrixAuthPayload;
  date_from: string;
  date_to: string;
  bitrix_user_ids: number[];
  settings: MetricSettings | null;
}): Promise<SystemReport> {
  return request<SystemReport>('/bitrix/system-report', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// --- Детализация метрик ---

export type MetricDetailRow = {
  columns: Record<string, unknown>;
};

export type MetricDetailResponse = {
  metric_code: string;
  metric_title: string;
  rows: MetricDetailRow[];
};

export function getMetricDetail(payload: {
  auth: BitrixAuthPayload;
  metric_code: string;
  employee_id: number;
  date_from: string;
  date_to: string;
  settings: MetricSettings | null;
}): Promise<MetricDetailResponse> {
  return request<MetricDetailResponse>('/bitrix/metric-detail', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
