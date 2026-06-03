import type { AuthUserPayload, Metric, Plan, Report, ReportAssignees, Submission, User } from './types';

declare global {
  interface Window {
    APP_CONFIG?: {
      API_BASE_URL?: string;
    };
  }
}

const API_BASE_URL =
  window.APP_CONFIG?.API_BASE_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  'http://127.0.0.1:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getMetrics(): Promise<Metric[]> {
  return request<Metric[]>('/metrics');
}

export function authMe(payload: AuthUserPayload): Promise<User> {
  return request<User>('/auth/me', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getUsers(): Promise<User[]> {
  return request<User[]>('/users');
}

export function getReport(dateFrom: string, dateTo: string): Promise<Report> {
  return request<Report>(`/reports?date_from=${dateFrom}&date_to=${dateTo}`);
}

export function getMySubmissions(
  bitrixUserId: number,
  dateFrom: string,
  dateTo: string,
): Promise<Submission[]> {
  return request<Submission[]>(
    `/submissions/my?bitrix_user_id=${bitrixUserId}&date_from=${dateFrom}&date_to=${dateTo}`,
  );
}

export function createSubmission(payload: {
  bitrix_user_id: number;
  report_date: string;
  slot: string;
  values: { metric_code: string; value: string }[];
}): Promise<Submission> {
  return request<Submission>('/submissions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getPlans(year: number, month: number): Promise<Plan[]> {
  return request<Plan[]>(`/plans?plan_year=${year}&plan_month=${month}`);
}

export function savePlans(payload: {
  created_by_bitrix_user_id: number;
  plans: {
    bitrix_user_id: number;
    metric_code: string;
    plan_year: number;
    plan_month: number;
    daily_value: string;
    monthly_value: string;
  }[];
}): Promise<Plan[]> {
  return request<Plan[]>('/plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getReportAssignees(): Promise<ReportAssignees> {
  return request<ReportAssignees>('/report-settings/assignees');
}

export function saveReportAssignees(bitrixUserIds: number[]): Promise<{ selected_bitrix_user_ids: number[] }> {
  return request<{ selected_bitrix_user_ids: number[] }>('/report-settings/assignees', {
    method: 'POST',
    body: JSON.stringify({ bitrix_user_ids: bitrixUserIds }),
  });
}
