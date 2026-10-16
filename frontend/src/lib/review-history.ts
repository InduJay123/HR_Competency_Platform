export type HistoryPerson = {
  id: string;
  name: string;
  designation: string;
  department: string;
  photo_url: string;
  active: boolean;
};
export type HistoricalPillar = {
  pillar: string;
  target: string;
  success_measure: string;
  notes: string;
  reflection: string;
  appraisal: string;
  outcome: string;
  judgement: string;
};
export type HistoricalReview = {
  id: string;
  year: number;
  kind: string;
  state: string;
  finalised_at: string | null;
  overall: string;
  summary: string;
  source: string;
  pillars: HistoricalPillar[];
};
export type ReviewHistoryData = {
  person: HistoryPerson;
  available_years: number[];
  selected_year: number | null;
  mid_year: HistoricalReview | null;
  year_end: HistoricalReview | null;
  overall_progress: string;
  pillar_comparison: {
    pillar: string;
    mid_year: HistoricalPillar | null;
    year_end: HistoricalPillar | null;
    progress: string;
    judgement_change: string;
  }[];
  commitments: {
    id: string;
    action: string;
    owner: string;
    due_date: string | null;
    success_measure: string;
    support: string;
    current_status: string | null;
    year_end_outcome: string;
    year_end_rationale: string;
  }[];
  history: Pick<
    HistoricalReview,
    "id" | "year" | "kind" | "state" | "finalised_at" | "overall"
  >[];
};
