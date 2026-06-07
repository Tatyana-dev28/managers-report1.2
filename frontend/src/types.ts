export type Metric = {
  code: string;
  title: string;
  is_money: boolean;
};

export type BitrixAuthPayload = {
  domain: string;
  access_token: string;
};

export type MetricSettings = {
  meeting_entity_type_id: number | null;
  contract_entity_type_id: number | null;
  invoice_entity_type_id: number;
  cold_base_deal_category_id: number | null;
  sale_deal_category_id: number | null;
  sale_success_stage_id: string | null;
  meeting_held_stage_ids: string[];
  contract_sent_stage_id: string | null;
  contract_signed_stage_id: string | null;
  invoice_sent_stage_id: string | null;
  invoice_paid_stage_id: string | null;
};

export type CrmType = {
  id: number | null;
  entity_type_id: number;
  title: string;
  code: string | null;
};

export type Category = {
  id: number;
  entity_type_id: number;
  name: string;
  sort: number | null;
};

export type Stage = {
  status_id: string;
  name: string;
  sort: number | null;
  entity_id: string | null;
  semantics: string | null;
};

export type BitrixUser = {
  bitrix_user_id: number;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
};

export type SystemReportMetric = {
  metric_code: string;
  metric_title: string;
  is_money: boolean;
  system_value: string;
};

export type EmployeeSystemReport = {
  bitrix_user_id: number;
  full_name: string;
  metrics: SystemReportMetric[];
};

export type SystemReport = {
  date_from: string;
  date_to: string;
  employees: EmployeeSystemReport[];
};
