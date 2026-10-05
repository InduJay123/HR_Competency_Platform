"use client";
import { useEffect, useRef, useState } from "react";
import { allPages, post } from "@/lib/api";
import { confirmLeaveDraft, registerDraft } from "@/lib/draft-guard";
import {
  DESCRIPTORS,
  ECP,
  OVERALL,
  PILLARS,
  human,
  type Evidence,
  type Json,
  type Review,
} from "@/lib/reviews";
import { Button, Card, Feedback } from "./ui";
import { Help, pillarHelp } from "./help";

type Answers = Record<string, string>;
const employeeFields = [
  [
    "outcomes",
    "Agreed outcomes",
    "What were you responsible for and why did it matter?",
  ],
  [
    "results",
    "Results and evidence",
    "Describe outcomes against expectations, with dates and context.",
  ],
  [
    "contributions",
    "Contribution beyond assigned work",
    "Include mentoring, knowledge sharing and cross-team support.",
  ],
  [
    "capability",
    "Capability and growth",
    "What strengths grew and where do you need support?",
  ],
  [
    "legacy",
    "Lasting contribution",
    "What will keep helping people, systems or culture?",
  ],
  [
    "barriers",
    "Barriers and context",
    "Explain constraints, dependencies and changed expectations.",
  ],
  [
    "support",
    "Support needed",
    "What would help you contribute more effectively?",
  ],
  [
    "prior_progress",
    "Previous commitments",
    "Describe progress on earlier commitments, or state no previous commitments.",
  ],
];
const managerFields = [
  [
    "rationale",
    "ECP rationale",
    "Explain current contribution, future capability and the conditions shaping both.",
  ],
  [
    "contributions",
    "Contribution Conversation",
    "Capture the top three contributions and their impact.",
  ],
  [
    "prior_progress",
    "Earlier commitments",
    "What changed and which commitments progressed?",
  ],
  ["next_success", "Next success", "Define a meaningful improvement outcome."],
  [
    "strengths",
    "Capability Map · strengths",
    "Describe demonstrated strengths and evidence.",
  ],
  [
    "gaps",
    "Capability Map · opportunities",
    "Identify development needs and practical support.",
  ],
  [
    "knowledge",
    "Legacy Tracker · knowledge",
    "What useful knowledge has been shared?",
  ],
  [
    "people",
    "Legacy Tracker · people",
    "Who has been supported, mentored or developed?",
  ],
  [
    "systems",
    "Legacy Tracker · systems and culture",
    "What improvements will endure?",
  ],
  ["summary", "Overall narrative", "Connect results, stewardship and context."],
  [
    "ecp_contribution",
    "ECP · current contribution",
    "Describe demonstrated contribution in context.",
  ],
  [
    "ecp_potential",
    "ECP · future capability",
    "Describe the evidence for future capability and conditions needed.",
  ],
  [
    "development_actions",
    "Capability Map · agreed development actions",
    "Record specific growth actions and support to discuss.",
  ],
  [
    "relationships",
    "Legacy Tracker · relationships",
    "What partnerships or working relationships were strengthened?",
  ],
  [
    "intervention",
    "Execution Gap · intervention",
    "Required for Under-Supported or Needs Attention. Focus on causes and support.",
  ],
];
function flatten(content: Record<string, Json>): Answers {
  const a: Answers = {};
  for (const [key, v] of Object.entries(content)) {
    if (typeof v === "string") a[key] = v;
  }
  const ps = content.pillars;
  if (ps && typeof ps === "object" && !Array.isArray(ps))
    for (const [p, v] of Object.entries(ps)) {
      if (typeof v === "string") a[`pillar_${p}`] = v;
      else if (v && typeof v === "object" && !Array.isArray(v)) {
        a[`pillar_${p}`] = String(v.narrative || "");
        a[`descriptor_${p}`] = String(v.descriptor || "");
        a[`sources_${p}`] = Array.isArray(v.evidence_ids)
          ? v.evidence_ids.join("|")
          : "";
      }
    }
  a.causes = Array.isArray(content.causes) ? content.causes.join("|") : "";
  return a;
}
function pack(a: Answers, manager: boolean): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(a))
    if (
      !k.startsWith("pillar_") &&
      !k.startsWith("descriptor_") &&
      !k.startsWith("sources_") &&
      k !== "causes"
    )
      out[k] = v;
  out.pillars = Object.fromEntries(
    PILLARS.map((p) => [
      p,
      manager
        ? {
            narrative: a[`pillar_${p}`] || "",
            descriptor: a[`descriptor_${p}`] || "",
            evidence_ids: (a[`sources_${p}`] || "").split("|").filter(Boolean),
          }
        : a[`pillar_${p}`] || "",
    ]),
  );
  if (manager) out.causes = (a.causes || "").split("|").filter(Boolean);
  return out;
}

export function ReviewForm({
  review,
  kind,
  onSubmitted,
}: {
  review: Review;
  kind: "EMPLOYEE" | "MANAGER";
  onSubmitted: () => void;
}) {
  const saved = review.forms?.find((f) => f.kind === kind),
    manager = kind === "MANAGER";
  const [answers, setAnswers] = useState<Answers>(() =>
      flatten(saved?.content || {}),
    ),
    [ids, setIds] = useState<string[]>(saved?.evidence_ids || []),
    [evidence, setEvidence] = useState<Evidence[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Draft changes save automatically."),
    [busy, setBusy] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [confirm, setConfirm] = useState(false);
  const version = useRef(review.version),
    dirty = useRef(false),
    saving = useRef(false),
    latest = useRef({ answers, ids });
  useEffect(() => {
    latest.current = { answers, ids };
  }, [answers, ids]);
  const locked =
    !!saved?.submitted_at ||
    !["OPEN", "PREPARING", "REVISION_REQUESTED"].includes(review.state);
  useEffect(() => {
    allPages<Evidence>(`evidence/?employee=${review.employee}`)
      .then(setEvidence)
      .catch((e) => setError(e.message));
  }, [review.employee]);
  async function save(submit = false) {
    if (saving.current || locked) return;
    saving.current = true;
    setBusy(true);
    setSubmitting(submit);
    setError("");
    const current = latest.current;
    try {
      const r = await post<Review>(
        `reviews/${review.id}/${manager ? "manager-assessment" : "employee-reflection"}/`,
        {
          version: version.current,
          content: pack(current.answers, manager),
          evidence_ids: current.ids,
          submit,
        },
      );
      version.current = r.version;
      if (
        current.answers === latest.current.answers &&
        current.ids === latest.current.ids
      )
        dirty.current = false;
      setStatus(
        submit
          ? "Submission sealed."
          : `Saved at ${new Date().toLocaleTimeString()}`,
      );
      if (submit) onSubmitted();
    } catch (e) {
      setError((e as Error).message);
      setStatus("Changes are not saved. Keep this page open.");
    } finally {
      saving.current = false;
      setBusy(false);
      setSubmitting(false);
    }
  }
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (locked || busy || error || !dirty.current) return;
    const timer = setTimeout(() => void saveRef.current(), 1500);
    return () => clearTimeout(timer);
  }, [answers, ids, locked, busy, error]);
  useEffect(() => {
    const unregister = registerDraft({
      dirty: () => dirty.current,
      discard: () => {
        dirty.current = false;
      },
    });
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    const navigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]") as HTMLAnchorElement | null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.getAttribute("href")?.startsWith("#")
      )
        return;
      if (!confirmLeaveDraft()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", navigation, true);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", navigation, true);
    };
  }, []);
  function update(k: string, v: string) {
    setError("");
    dirty.current = true;
    setAnswers((a) => ({ ...a, [k]: v }));
  }
  const field = (key: string, label: string, hint: string) => (
    <label key={key}>
      {label}
      <small>{hint}</small>
      <textarea
        disabled={locked || submitting}
        value={answers[key] || ""}
        maxLength={20000}
        rows={3}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  return (
    <div className="review-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {manager ? "E03 · MANAGER APPRAISAL" : "E02 · EMPLOYEE REFLECTION"}
          </p>
          <h2>
            {manager ? "Manager appraisal" : "Your contribution, in your words"}
          </h2>
        </div>
        <span role="status">{locked ? "Read-only submission" : status}</span>
      </div>
      <Feedback error={error} />
      <Card title="01 · Employee context">
        <p>
          {review.employee_name} · {human(review.cycle_detail.kind)}{" "}
          {review.cycle_detail.year}
        </p>
        <p>
          {review.cycle_detail.starts_on} – {review.cycle_detail.ends_on}
        </p>
        {review.senior_leader && (
          <p>
            Senior leadership lens: connect strategic outcomes,
            organisation-wide impact, stewardship of resources and sustainable
            capability to dated evidence.
          </p>
        )}
      </Card>
      {manager && (
        <Card title="02 · ECP position">
          <label>
            Human ECP assessment
            <select
              disabled={locked || submitting}
              value={answers.ecp || ""}
              onChange={(e) => update("ecp", e.target.value)}
            >
              <option value="">Choose a position</option>
              {ECP.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          {field(...(managerFields[0] as [string, string, string]))}
        </Card>
      )}
      <Card title={manager ? "03 · Five pillars" : "02 · Five pillars"}>
        {PILLARS.map((p) => (
          <div key={p} className="pillar">
            <h3>
              {human(p)} <Help label={human(p)}>{pillarHelp[p]}</Help>
            </h3>
            {manager && (
              <label>
                Qualitative descriptor
                <select
                  value={answers[`descriptor_${p}`] || ""}
                  disabled={locked || submitting}
                  onChange={(e) => update(`descriptor_${p}`, e.target.value)}
                >
                  <option value="">Choose descriptor</option>
                  {DESCRIPTORS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            )}
            {field(
              `pillar_${p}`,
              `${human(p)} · narrative`,
              "Describe specific examples and reference the evidence selected below.",
            )}
          </div>
        ))}
      </Card>
      <Card
        title={
          manager
            ? "04 · Stewardship tools and context"
            : "03 · Contribution and development"
        }
      >
        {(manager ? managerFields.slice(1) : employeeFields).map((f) =>
          field(...(f as [string, string, string])),
        )}
        {manager && (
          <fieldset disabled={locked || submitting}>
            <legend>Execution-gap factors</legend>
            {[
              "Ability",
              "Motivation",
              "Opportunity",
              "Role Fit",
              "Manager / System",
            ].map((c) => (
              <label className="check-label" key={c}>
                <input
                  type="checkbox"
                  checked={(answers.causes || "").split("|").includes(c)}
                  onChange={(e) =>
                    update(
                      "causes",
                      e.target.checked
                        ? [
                            ...(answers.causes || "")
                              .split("|")
                              .filter(Boolean),
                            c,
                          ].join("|")
                        : (answers.causes || "")
                            .split("|")
                            .filter((x) => x !== c)
                            .join("|"),
                    )
                  }
                />
                {c}
              </label>
            ))}
          </fieldset>
        )}
      </Card>
      {review.senior_leader && (
        <Card title="Senior leadership perspective">
          {field(
            "strategic_outcomes",
            "Strategic outcomes",
            "Connect organisation targets to documented outcomes and trade-offs.",
          )}
          {field(
            "leadership_support",
            "Leadership and support",
            "Describe cross-team support, people development and leadership accountability.",
          )}
          {field(
            "sustainable_systems",
            "Sustainable systems and stewardship",
            "Explain resource decisions, risk context and the capability that will endure.",
          )}
        </Card>
      )}
      <Card title="Authorised evidence selection">
        <Help label="Evidence visibility">
          Selected evidence becomes part of this review. Linking an item does
          not make its private storage public.
        </Help>
        <p>
          Select evidence for Head of HR validation. Unselected files and
          private notes are not included in this review.
        </p>
        {evidence.length === 0 ? (
          <p>
            No evidence is available. Add it to the relevant work item first, or
            explain the evidence gap in your reflection.
          </p>
        ) : (
          evidence.map((e) => (
            <label className="check-label" key={e.id}>
              <input
                type="checkbox"
                disabled={locked || submitting}
                checked={ids.includes(e.id)}
                onChange={(ev) => {
                  dirty.current = true;
                  setIds(
                    ev.target.checked
                      ? [...ids, e.id]
                      : ids.filter((x) => x !== e.id),
                  );
                }}
              />
              {e.title} · {human(e.validation)}
            </label>
          ))
        )}
      </Card>
      {manager && (
        <Card title="Overall human assessment">
          <label>
            Overall stewardship descriptor
            <select
              disabled={locked || submitting}
              value={answers.overall || ""}
              onChange={(e) => update("overall", e.target.value)}
            >
              <option value="">Choose descriptor</option>
              {OVERALL.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <p>
            This is your appraisal. Head of HR validates evidence and records
            the final human assessment.
          </p>
        </Card>
      )}
      {!locked && (
        <Card title="Save and submit">
          <p>
            Submitting seals this version. Head of HR can open a new revision
            round without changing the submitted history.
          </p>
          <div className="actions">
            <Button variant="neutral" disabled={busy} onClick={() => save()}>
              Save draft
            </Button>
            <Button disabled={busy} onClick={() => setConfirm(true)}>
              Review submission
            </Button>
          </div>
          {confirm && (
            <div className="confirm-box">
              <p>
                Confirm this is your complete reflection for the selected
                period.
              </p>
              <div className="actions">
                <Button disabled={busy} onClick={() => save(true)}>
                  Confirm and submit
                </Button>
                <Button variant="neutral" onClick={() => setConfirm(false)}>
                  Keep editing
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
