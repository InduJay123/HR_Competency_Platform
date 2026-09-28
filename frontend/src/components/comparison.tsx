"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, post } from "@/lib/api";
import { type Review, human } from "@/lib/reviews";
import { useSession } from "./shell";
import { Button, Card, Feedback, Loading } from "./ui";
type Outcome = { outcome: string; rationale: string };
type Comparison = {
  baseline: {
    id: string;
    action: string;
    success_measure: string;
    due_date: string;
    manager_support: string;
  }[];
  outcomes: Record<string, Outcome>;
  version: number;
};
function Row({
  item,
  saved,
  editable,
  onSave,
}: {
  item: Comparison["baseline"][number];
  saved?: Outcome;
  editable: boolean;
  onSave: (id: string, value: Outcome) => Promise<void>;
}) {
  const [outcome, setOutcome] = useState(saved?.outcome || ""),
    [rationale, setRationale] = useState(saved?.rationale || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Card title={item.action}>
      <p>Original success measure: {item.success_measure}</p>
      <p>Agreed support: {item.manager_support}</p>
      <p>Original due date: {item.due_date}</p>
      <label>
        Year-End outcome
        <select
          disabled={!editable}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        >
          <option value="">Not assessed</option>
          {["MET", "PARTIALLY_MET", "MISSED"].map((x) => (
            <option key={x} value={x}>
              {human(x)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Evidence and context
        <textarea
          disabled={!editable}
          maxLength={10000}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
      </label>
      <Feedback error={error} />
      {editable && (
        <Button
          disabled={busy || !outcome || !rationale.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(item.id, { outcome, rationale });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save outcome
        </Button>
      )}
    </Card>
  );
}
export function Comparison() {
  const { id } = useParams<{ id: string }>(),
    session = useSession();
  const [review, setReview] = useState<Review | null>(null),
    [data, setData] = useState<Comparison | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<Review>(`reviews/${id}/`),
      api<Comparison>(`reviews/${id}/comparison/`),
    ])
      .then(([r, c]) => {
        setReview(r);
        setData(c);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  const member = session.memberships?.find(
    (m) => m.company_id === session.company_id,
  );
  async function save(commitment_id: string, value: Outcome) {
    const r = await post<Comparison>(`reviews/${id}/comparison/`, {
      version: data?.version,
      commitment_id,
      ...value,
    });
    setData(r);
  }
  return (
    <>
      <Link href={`/employee/reviews/${id}`}>← Return to review</Link>
      <h1>Mid-Year / Year-End comparison</h1>
      <p className="subtitle">
        Assess what changed against the original agreement. Mid-Year information
        remains unchanged.
      </p>
      <Feedback error={error} />
      {!data || !review ? (
        <Loading />
      ) : (
        data.baseline.map((c) => (
          <Row
            key={c.id}
            item={c}
            saved={data.outcomes[c.id]}
            editable={
              member?.id === review.manager_member &&
              ["OPEN", "PREPARING", "REVISION_REQUESTED"].includes(
                review.state,
              ) &&
              !review.forms?.find((f) => f.kind === "MANAGER")?.submitted_at
            }
            onSave={save}
          />
        ))
      )}
    </>
  );
}
