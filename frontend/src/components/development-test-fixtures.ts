import type { FollowUpCommitment } from "./development";

export const followUpFixture: FollowUpCommitment = {
  id: "commitment",
  review: "review",
  employee: "person",
  owner: "chief",
  owner_name: "Morgan Chief Steward",
  employee_details: {
    id: "person",
    name: "Alex Steward Guy",
    designation: "Analyst",
    department: "Finance",
    photo_url: "/api/v1/employees/person/photo/",
  },
  action: "Transfer supplier onboarding responsibility",
  manager_support: "Provide monthly coaching check-ins.",
  success_measure: "Agreed handover completed",
  due_date: "2026-09-30",
  status: "SUPPORT_NEEDED",
  overdue: true,
  can_update: true,
  can_create_work: true,
  work_item: null,
  version: 1,
};
export const followUpOptions = {
  people: [{ id: "person", name: "Alex Steward Guy", designation: "Analyst" }],
  departments: [{ id: "finance", name: "Finance" }],
};
export const followUpPage = {
  count: 1,
  next: null,
  previous: null,
  results: [followUpFixture],
  as_of: "2026-10-16",
  summary: {
    total: 1,
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    SUPPORT_NEEDED: 1,
    COMPLETE: 0,
  },
};
