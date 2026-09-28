"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, post, allPages } from "@/lib/api";
import type { Employee, Named, Page } from "@/lib/types";
import { Button, Card, Feedback, Loading } from "./ui";
export function People({ manage = false }: { manage?: boolean }) {
  const [data, setData] = useState<Page<Employee> | null>(null),
    [departments, setDepartments] = useState<Named[]>([]),
    [roles, setRoles] = useState<Named[]>([]),
    [managers, setManagers] = useState<Employee[]>([]),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1);
  const load = useCallback(() => {
    Promise.all([
      api<Page<Employee>>(`employees/?page=${page}`),
      allPages<Named>("organisation/departments/"),
      allPages<Named>("organisation/roles/"),
      allPages<Employee>("employees/?managers=true"),
    ])
      .then(([p, d, r, m]) => {
        setData(p);
        setDepartments(d);
        setRoles(r);
        setManagers(m);
      })
      .catch((e) => setError(e.message));
  }, [page]);
  useEffect(load, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await post("employees/", {
        ...data,
        is_manager: data.is_manager === "on",
        senior_leader: data.senior_leader === "on",
        joined_on: data.joined_on || null,
        department: data.department || null,
        job_role: data.job_role || null,
      });
      setSuccess(
        "Employee created with login disabled until account activation.",
      );
      setCreating(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reporting(e: FormEvent<HTMLFormElement>, p: Employee) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post(`employees/${p.id}/reporting/`, {
        manager_id: new FormData(e.currentTarget).get("manager") || null,
        version: p.version,
      });
      setSuccess("Reporting relationship saved.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">PEOPLE / ACCOUNTABILITY</p>
      <h1>{manage ? "People directory" : "My team"}</h1>
      <p className="subtitle">
        Clear responsibilities and reporting relationships.
      </p>
      <Feedback error={error} success={success} />
      {manage && (
        <div className="toolbar">
          <Button onClick={() => setCreating(!creating)}>
            {creating ? "Close form" : "Add employee"}
          </Button>
        </div>
      )}
      {creating && (
        <Card title="Add employee">
          <form onSubmit={create}>
            <div className="form-grid">
              <label>
                First name
                <input name="first_name" required />
              </label>
              <label>
                Last name
                <input name="last_name" required />
              </label>
              <label>
                Business email
                <input name="email" type="email" required />
              </label>
              <label>
                Designation
                <input name="designation" />
              </label>
              <label>
                Joining date
                <input name="joined_on" type="date" />
              </label>
              <label>
                Department
                <select name="department">
                  <option value="">Select department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Job role
                <select name="job_role">
                  <option value="">Select role</option>
                  {roles.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <input className="check" type="checkbox" name="is_manager" />{" "}
              Assigns and manages work
            </label>
            <label>
              <input className="check" type="checkbox" name="senior_leader" />{" "}
              Senior leadership evaluation view
            </label>
            <Button disabled={busy}>Create employee</Button>
          </form>
        </Card>
      )}
      {!data && !error ? (
        <Loading />
      ) : (
        <Card title="People and reporting">
          {data?.results.length ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Role</th>
                      <th>Employment start</th>
                      {manage && <th>Platform joined</th>}
                      <th>Reports to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>
                            {p.first_name} {p.last_name}
                          </strong>
                          <small>{p.email}</small>
                          <small>{p.stewardship_code}</small>
                          {manage && (
                            <Link href={`/hr/employees/${p.id}`}>
                              Profile and invitation →
                            </Link>
                          )}
                        </td>
                        <td>{p.designation}</td>
                        <td>{p.joined_on || "Not provided"}</td>
                        {manage && (
                          <td>
                            {p.platform_joined_at
                              ? new Date(p.platform_joined_at).toLocaleString()
                              : "Not recorded"}
                          </td>
                        )}
                        <td>
                          {manage ? (
                            <form
                              className="inline-form"
                              onSubmit={(e) => reporting(e, p)}
                            >
                              <select
                                key={p.version}
                                name="manager"
                                aria-label={`Reporting manager for ${p.first_name}`}
                                defaultValue={p.manager_id || ""}
                              >
                                <option value="">No reporting manager</option>
                                {managers
                                  .filter((m) => m.is_manager && m.id !== p.id)
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.first_name} {m.last_name}
                                    </option>
                                  ))}
                              </select>
                              <Button variant="neutral" disabled={busy}>
                                Save
                              </Button>
                            </form>
                          ) : (
                            data.results.find((m) => m.id === p.manager_id)
                              ?.first_name || "Outside this view"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="paging">
                <Button
                  variant="neutral"
                  disabled={!data.previous}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {page} · {data.count} people
                </span>
                <Button
                  variant="neutral"
                  disabled={!data.next}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          ) : (
            <p className="empty">
              No people are available in your access scope.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
export function Organisation() {
  const [data, setData] = useState<{ departments: Named[]; roles: Named[] }>({
      departments: [],
      roles: [],
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    Promise.all([
      api<Page<Named>>("organisation/departments/"),
      api<Page<Named>>("organisation/roles/"),
    ])
      .then(([d, r]) => setData({ departments: d.results, roles: r.results }))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  async function add(
    e: FormEvent<HTMLFormElement>,
    type: "departments" | "roles",
  ) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    try {
      await post(`organisation/${type}/`, {
        name: new FormData(form).get("name"),
      });
      form.reset();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>Departments and job roles</h1>
        <Link className="button neutral" href="/hr/management-structure">
          View management structure
        </Link>
      </div>
      <p className="subtitle">
        Give each employee a clear place in your organisation.
      </p>
      <Feedback error={error} />
      <div className="split">
        {(["departments", "roles"] as const).map((type) => (
          <Card
            key={type}
            title={type === "roles" ? "Job roles" : "Departments"}
          >
            <ul>
              {data[type].map((d) => (
                <li key={d.id}>{d.name}</li>
              ))}
            </ul>
            <form onSubmit={(e) => add(e, type)}>
              <label>
                {type === "roles" ? "Role name" : "Department name"}
                <input name="name" required maxLength={120} />
              </label>
              <Button disabled={busy}>
                Add {type === "roles" ? "role" : "department"}
              </Button>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
