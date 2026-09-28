"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Page } from "@/lib/types";
import { Button, Card, Feedback } from "./ui";
type Evidence = {
  id: string;
  title: string;
  kind: string;
  note: string;
  link: string;
  validation: string;
};
export function EvidencePanel({
  taskId,
  canAdd,
}: {
  taskId: string;
  canAdd: boolean;
}) {
  const [items, setItems] = useState<Evidence[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Page<Evidence>>(`evidence/?task=${taskId}`)
      .then((d) => setItems(d.results))
      .catch((e) => setError(e.message));
  }, [taskId]);
  useEffect(load, [load]);
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget,
      data = new FormData(form);
    data.set("task", taskId);
    const file = data.get("file");
    if (file instanceof File && !file.size) data.delete("file");
    try {
      await api("evidence/", { method: "POST", body: data });
      form.reset();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Evidence">
      <p>
        Keep the proof behind the outcome. Evidence stays within authorised work
        and review access.
      </p>
      <Feedback error={error} />
      {items.map((x) => (
        <div key={x.id} className="card">
          <strong>{x.title}</strong>
          <small> · {x.validation}</small>
          <p>{x.note}</p>
          {x.kind === "FILE" && (
            <a href={`/api/v1/evidence/${x.id}/download/`}>
              Download private evidence
            </a>
          )}
          {x.link && (
            <a href={x.link} target="_blank" rel="noopener noreferrer">
              Open reference ↗
            </a>
          )}
        </div>
      ))}
      {!items.length && <p className="empty">No evidence attached yet.</p>}
      {canAdd && (
        <form onSubmit={add}>
          <label>
            Evidence title
            <input name="title" required maxLength={180} />
          </label>
          <label>
            Evidence type
            <select name="kind">
              <option value="NOTE">Written evidence</option>
              <option value="LINK">HTTPS reference</option>
              <option value="FILE">Private file</option>
            </select>
          </label>
          <label>
            Supporting note
            <textarea name="note" />
          </label>
          <label>
            Reference link
            <input name="link" type="url" />
          </label>
          <label>
            Upload PDF, PNG or JPEG (5 MB maximum)
            <input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" />
          </label>
          <Button disabled={busy}>Attach evidence</Button>
        </form>
      )}
    </Card>
  );
}
