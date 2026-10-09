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
  can_view_coaching?: boolean;
  workflow?: {
    employee_submitted: boolean;
    manager_submitted: boolean;
    ai_coaching: string;
    ai_blocked_reason?: string;
    conversation_complete: boolean;
    commitments_complete: boolean;
    confirmations: { round: number; [key: string]: number | { actor: string; at: string } };
    missing: string[];
  };
  submission_history?: Json[];
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
    actor_id?: string;
    actor__user__first_name?: string;
    actor__user__last_name?: string;
  }[];
  conversation?: { discussion?: string };
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
