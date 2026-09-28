"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { allPages } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { Card, Feedback, Loading } from "./ui";
export function Hierarchy() {
  const [people, setPeople] = useState<Employee[] | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState("Reporting map");
  useEffect(() => {
    let alive = true;
    allPages<Employee>("employees/")
      .then((x) => {
        if (alive) setPeople(x);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const byId = useMemo(
    () => new Map((people || []).map((p) => [p.id, p])),
    [people],
  );
  const branches = useMemo(() => {
    const m = new Map<string, Employee[]>();
    for (const p of people || []) {
      const key = p.manager_id || "";
      m.set(key, [...(m.get(key) || []), p]);
    }
    return m;
  }, [people]);
  const roots = (people || []).filter(
    (p) => !p.manager_id || !byId.has(p.manager_id),
  );
  function personCard(p: Employee) {
    return (
      <Link
        className={`hierarchy-person ${p.is_manager ? "manager" : ""}`}
        href={`/hr/employees/${p.id}`}
      >
        <span className="avatar-initials" aria-hidden="true">
          {p.first_name[0]}
          {p.last_name[0]}
        </span>
        <span>
          <strong>
            {p.first_name} {p.last_name}
          </strong>
          <small>{p.designation || "Designation not recorded"}</small>
        </span>
      </Link>
    );
  }
  function branch(p: Employee, ancestors: string[] = []) {
    const children = branches.get(p.id) || [];
    return (
      <li key={p.id}>
        {personCard(p)}
        {children.length > 0 &&
          (ancestors.length < 30 && !ancestors.includes(p.id) ? (
            <ul>
              {children.map((child) => branch(child, [...ancestors, p.id]))}
            </ul>
          ) : (
            <p>Use List view to inspect deeper reporting relationships.</p>
          ))}
      </li>
    );
  }
  const shown = view === "Unassigned" ? roots : people || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Management Structure</h1>
          <p className="subtitle">
            Clear reporting lines. Accountable review relationships.
          </p>
        </div>
        <Link className="button primary" href="/hr/employees">
          Edit relationships
        </Link>
      </div>
      <nav className="account-tabs" aria-label="Reporting views">
        {["Reporting map", "Unassigned", "List view"].map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-current={view === v ? "page" : undefined}
          >
            {v}
            {v === "Unassigned" ? ` ${roots.length}` : ""}
          </button>
        ))}
      </nav>
      <Feedback error={error} />
      {!people ? (
        !error && <Loading />
      ) : (
        <Card
          title={
            view === "Reporting map"
              ? "Company reporting structure"
              : view === "Unassigned"
                ? "People without a reporting manager"
                : "Reporting relationships"
          }
        >
          <p className="subtitle">
            {view === "Unassigned"
              ? "Some leaders legitimately have no manager. Confirm each relationship before including the person in a review cycle."
              : "A person may both receive work and manage a team."}
          </p>
          {people.length === 0 ? (
            <p className="empty">
              Add people and reporting managers to build your company structure.
            </p>
          ) : view === "Reporting map" ? (
            <div
              className="hierarchy-scroll"
              tabIndex={0}
              aria-label="Scrollable reporting map"
            >
              <ul className="hierarchy-tree">{roots.map((p) => branch(p))}</ul>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Designation</th>
                    <th>Reports to</th>
                    <th>Direct reports</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/hr/employees/${p.id}`}>
                          {p.first_name} {p.last_name}
                        </Link>
                      </td>
                      <td>{p.designation || "Not recorded"}</td>
                      <td>
                        {p.manager_id && byId.has(p.manager_id)
                          ? `${byId.get(p.manager_id)!.first_name} ${byId.get(p.manager_id)!.last_name}`
                          : "No manager assigned"}
                      </td>
                      <td>{branches.get(p.id)?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && (
                <p className="empty">All people have a reporting manager.</p>
              )}
            </div>
          )}
        </Card>
      )}
      <Link className="growth-back" href="/hr/organisation">
        Departments and job roles →
      </Link>
    </>
  );
}
