"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, post } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { Button, Card, Feedback, Loading } from "./ui";
export function EmployeeDetail() {
  const { id } = useParams<{ id: string }>(),
    [p, setP] = useState<Employee | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Employee>(`employees/${id}/`)
      .then(setP)
      .catch((e) => setError(e.message));
  }, [id]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!p) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const next = await api<Employee>(`employees/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          version: p.version,
          designation: f.get("designation"),
          joined_on: f.get("joined_on") || null,
          senior_leader: f.get("senior_leader") === "on",
        }),
      });
      setP(next);
      setSuccess("Steward Associate profile saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link href="/hr/employees">← People directory</Link>
      <h1>Steward Associate profile</h1>
      <Feedback error={error} success={success} />
      {!p ? (
        <Loading />
      ) : (
        <>
          <Card title={`${p.first_name} ${p.last_name}`}>
            <p>{p.email}</p>
            <p>
              <strong>{p.stewardship_code}</strong> · Platform joined{" "}
              {p.platform_joined_at
                ? new Date(p.platform_joined_at).toLocaleString()
                : "Not recorded"}
            </p>
            <form onSubmit={save}>
              <label>
                Designation
                <input
                  name="designation"
                  maxLength={160}
                  defaultValue={p.designation}
                />
              </label>
              <label>
                Steward Associate joining date
                <input
                  name="joined_on"
                  type="date"
                  defaultValue={p.joined_on || ""}
                />
              </label>
              <p>
                Reports to:{" "}
                {p.is_head_hr
                  ? "No reporting manager"
                  : `${p.manager_name} — Chief Steward`}
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="senior_leader"
                  defaultChecked={p.senior_leader}
                />
                Senior leadership evaluation perspective
              </label>
              <Button disabled={busy}>Save Steward Associate details</Button>
            </form>
          </Card>
          <Card title="Workspace access">
            <p>
              Send an access link to this Steward Associate’s recorded business email.
              Email delivery requires the server email service and worker.
            </p>
            <Button
              variant="neutral"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await post(`employees/${id}/invite/`, {});
                  setSuccess("Invitation queued for delivery.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Send access invitation
            </Button>
          </Card>
        </>
      )}
    </>
  );
}
