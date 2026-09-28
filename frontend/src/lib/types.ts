export type Context = "employee" | "manager" | "hr" | "reviews" | "approvals";
export type Membership = {
  id: string;
  company_id: string;
  name: string;
  tagline: string;
  logo_url: string;
  contexts: Context[];
  stewardship_code?: string;
  mission?: string;
  vision?: string;
};
export type Session = {
  authenticated: boolean;
  is_platform_admin?: boolean;
  csrf_token: string;
  user?: { id: string; first_name: string; last_name: string; email: string };
  memberships?: Membership[];
  company_id?: string;
  context?: Context;
  contexts?: Context[];
};
export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
export type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  designation: string;
  joined_on: string | null;
  stewardship_code?: string;
  platform_joined_at?: string;
  department: string | null;
  job_role: string | null;
  photo_url: string;
  is_manager: boolean;
  senior_leader: boolean;
  manager_id: string | null;
  version: number;
  onboarding_completed_at: string | null;
};
export type Work = {
  id: string;
  title: string;
  description: string;
  expected_outcome: string;
  status: string;
  priority: string;
  assigned_to: string;
  assigned_by: string;
  accountable_owner: string;
  assignee_name: string;
  due_date: string;
  version: number;
  parent_task: string | null;
};
export type WorkUpdate = {
  id: string;
  status: string;
  notes: string;
  blocker: string;
  next_step: string;
  result: string;
  created_at: string;
};
export type Named = { id: string; name: string };
export type Notice = {
  id: string;
  title: string;
  path: string;
  created_at: string;
  read_at: string | null;
};

export type PersonalProfile = Employee & {
  phone: string;
  contact_email: string;
  employment_company: string;
  location: string;
  bio: string;
  skills: string;
  company_name: string;
  department_name: string;
  manager_name: string;
  notification_digest: boolean;
};
