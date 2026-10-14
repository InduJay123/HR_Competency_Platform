"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { human } from "@/lib/reviews";
import { Card, Feedback, Loading } from "./ui";

type ComparisonData = {
  baseline: {
    id: string;
    action: string;
    success_measure: string;
    due_date: string;
    manager_support: string;
  }[];
  outcomes: Record<string, { outcome: string; rationale: string }>;
};

export function Comparison() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<ComparisonData>(`reviews/${id}/comparison/`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <>
      <Link href={`/employee/reviews/${id}`}>Return to review</Link>
      <h1>Historical Mid-Year commitments</h1>
      <p className="subtitle">
        Read-only reference. Mid-Year commitment outcomes are not required to submit this appraisal.
      </p>
      <Feedback error={error} />
      {!data ? <Loading /> : data.baseline.map((item) => (
        <Card key={item.id} title={item.action}>
          <p>Original success measure: {item.success_measure}</p>
          <p>Agreed support: {item.manager_support}</p>
          <p>Original due date: {item.due_date}</p>
          {data.outcomes[item.id] && <>
            <p>Previously recorded outcome: {human(data.outcomes[item.id].outcome)}</p>
            <p>{data.outcomes[item.id].rationale}</p>
          </>}
        </Card>
      ))}
    </>
  );
}
