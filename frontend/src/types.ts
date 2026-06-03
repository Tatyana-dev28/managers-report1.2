export type Role = 'manager' | 'leader';

export type AuthUserPayload = {
  bitrix_user_id: number;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
  domain: string | null;
  member_id: string | null;
};

export type User = {
  id: number;
  bitrix_user_id: number;
  first_name: string | null;
  last_name: string | null;
  role: Role;
  full_name: string;
};

export type Metric = {
  code: string;
  title: string;
  is_money: boolean;
};

export type ReportMetric = {
  metric_code: string;
  metric_title: string;
  is_money: boolean;
  manager_value: string;
  system_value: string;
  difference: string;
  plan_value: string;
  plan_status: 'no_plan' | 'not_completed' | 'completed' | 'over_completed';
};

export type EmployeeReport = {
  user_id: number;
  bitrix_user_id: number;
  full_name: string;
  opened_app: boolean;
  submitted_data: boolean;
  metrics: ReportMetric[];
};

export type Report = {
  date_from: string;
  date_to: string;
  working_days: number;
  employees: EmployeeReport[];
};

export type ReportAssignees = {
  selected_bitrix_user_ids: number[];
  available_users: User[];
};

export type SubmissionValue = {
  metric_code: string;
  value: string;
};

export type Submission = {
  id: number;
  bitrix_user_id: number;
  report_date: string;
  slot: string;
  submitted_at: string;
  values: SubmissionValue[];
};

export type Plan = {
  bitrix_user_id: number;
  metric_code: string;
  plan_year: number;
  plan_month: number;
  daily_value: string;
  monthly_value: string;
};
