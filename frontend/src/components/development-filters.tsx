"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { human } from "@/lib/reviews";
import { Button, Feedback } from "./ui";
import styles from "./development.module.css";

export type FollowUpFilters = {
  search: string;
  employee: string;
  status: string;
  department: string;
  due: string;
};
type Options = {
  people: { id: string; name: string; designation: string }[];
  departments: { id: string; name: string }[];
};
export function DevelopmentFilters({
  value,
  onChange,
}: {
  value: FollowUpFilters;
  onChange: (value: FollowUpFilters) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(value.search);
  useEffect(() => {
    let alive = true;
    api<Options>("development/filters/")
      .then((d) => {
        if (alive) setOptions(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const change = (key: keyof FollowUpFilters, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <section
      className={styles.filterPanel}
      aria-label="Filter development commitments"
    >
      <Feedback error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          change("search", search.trim());
        }}
        className={styles.filters}
      >
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Steward Associate name or commitment"
          />
        </label>
        <label>
          Steward Associate
          <select
            value={value.employee}
            disabled={!options}
            onChange={(e) => change("employee", e.target.value)}
          >
            <option value="">All Steward Associates</option>
            {options?.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.designation ? ` · ${p.designation}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={value.status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {["NOT_STARTED", "IN_PROGRESS", "SUPPORT_NEEDED", "COMPLETE"].map(
              (s) => (
                <option key={s} value={s}>
                  {human(s)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Department
          <select
            value={value.department}
            disabled={!options}
            onChange={(e) => change("department", e.target.value)}
          >
            <option value="">All departments</option>
            {options?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due
          <select
            value={value.due}
            onChange={(e) => change("due", e.target.value)}
          >
            <option value="">All dates</option>
            <option value="overdue">Overdue</option>
            <option value="month">Due this month</option>
            <option value="later">Due later</option>
          </select>
        </label>
        <div className={styles.filterActions}>
          <Button type="submit">Search</Button>
          <Button
            type="button"
            variant="neutral"
            onClick={() => {
              setSearch("");
              onChange({
                search: "",
                employee: "",
                status: "",
                department: "",
                due: "",
              });
            }}
          >
            Clear filters
          </Button>
        </div>
      </form>
      <small>
        Overdue excludes completed commitments. Due later means after this
        calendar month.
      </small>
    </section>
  );
}
