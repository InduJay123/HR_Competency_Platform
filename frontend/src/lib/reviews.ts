export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };
export type Cycle = {
  id: string;
  year: number;
  kind: "MID_YEAR" | "YEAR_END";
  starts_on: string;
  ends_on: string;
  due_on: string;
  launched_at: string | null;
};
export type Evidence = {
  id: string;
  title: string;
  kind: string;
  note: string;
  link: string;
  validation: string;
  authorised_excerpt: string;
  validation_reason: string;
};
export type Commitment = {
  id: string;
  review: string;
  employee: string;
  owner: string;
  owner_id?: string;
  work_item?: string | null;
  can_update?: boolean;
  can_create_work?: boolean;
  action: string;
  manager_support: string;
  success_measure: string;
  due_date: string;
  status: string;
  version: number;
};
export type Form = {
  kind: "EMPLOYEE" | "MANAGER";
  round: number;
  content: Record<string, Json>;
  evidence_ids: string[];
  submitted_at: string | null;
};
export type Review = {
  id: string;
  employee: string;
  employee_name: string;
  employee_member: string;
  manager: string;
  manager_name: string;
  manager_member: string;
  reviewer: string;
  senior_leader: boolean;
  cycle_detail: Cycle;
  state: string;
  round: number;
  version: number;
  employee_ack: string | null;
  employee_comments?: string;
  manager_ack: string | null;
  finalised_at: string | null;
  forms?: Form[];
  evidence?: Evidence[];
  history?: {
    action: string;
    reason: string;
    created_at: string;
    version: number;
  }[];
  conversation?: { discussion: string };
  hr_assessment?: {
    overall: string;
    rationale: string;
    human_only_reason?: string;
  };
  commitments?: Commitment[];
  snapshot?: { sha256: string; content: Json };
  midyear_baseline?: Json;
};
export const PILLARS = [
  "character",
  "contribution",
  "capability",
  "context",
  "continuity",
];
export const DESCRIPTORS = [
  "Exceptional",
  "Strong",
  "Developing",
  "Needs Attention",
];
export const ECP = ["Stars", "Growers", "Workhorses", "Under-Supported"];
export const OVERALL = [
  "Exceptional Steward",
  "Strong Steward",
  "Developing Steward",
  "Stewardship at Risk",
];
export const human = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (s) => s.toUpperCase());
