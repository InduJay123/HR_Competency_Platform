import type { HistoricalReview, ReviewHistoryData } from "@/lib/review-history";

export function historyFixture(): ReviewHistoryData {
  const pillars = [
    "context",
    "character",
    "capability",
    "continuity",
    "contribution",
  ];
  const record = (kind: string): HistoricalReview => ({
    id: kind,
    kind,
    year: 2026,
    state: "FINALISED",
    finalised_at: "2026-12-31T12:00:00Z",
    overall: kind === "MID_YEAR" ? "Developing Steward" : "Strong Steward",
    summary: "Human summary of contribution and support.",
    source: "Sealed final record",
    pillars: pillars.map((pillar) => ({
      pillar,
      target: "Build a reliable handover process",
      success_measure: "Agreed ownership and fewer missed handovers",
      notes: "",
      reflection: "I worked with colleagues on the handover.",
      appraisal:
        "The Steward Guy demonstrated progress against the agreed target.",
      outcome: kind === "MID_YEAR" ? "Partially achieved" : "Achieved",
      judgement: "Strong",
    })),
  });
  const mid = record("MID_YEAR"),
    end = record("YEAR_END");
  return {
    person: {
      id: "person",
      name: "Alex Steward Guy",
      designation: "Analyst",
      department: "Finance",
      photo_url: "",
      active: true,
    },
    available_years: [2026, 2025],
    selected_year: 2026,
    mid_year: mid,
    year_end: end,
    overall_progress: "Changed from Developing Steward to Strong Steward",
    pillar_comparison: pillars.map((pillar, i) => ({
      pillar,
      mid_year: mid.pillars[i],
      year_end: end.pillars[i],
      progress: "Improved",
      judgement_change: "Sustained",
    })),
    commitments: [
      {
        id: "commitment",
        action: "Transfer supplier onboarding responsibility",
        owner: "Alex Steward Guy",
        due_date: "2026-12-01",
        success_measure: "Agreed handover completed",
        support: "Practice with team",
        current_status: "Complete",
        year_end_outcome: "",
        year_end_rationale: "",
      },
    ],
    history: [end, mid, { ...mid, id: "old", year: 2025 }],
  };
}
