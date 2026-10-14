"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { allPages } from "@/lib/api";
import type { Employee } from "@/lib/types";
import { Card, Feedback, Loading } from "./ui";

export function Hierarchy() {
  const [people, setPeople] = useState<Employee[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    allPages<Employee>("employees/")
      .then((data) => {
        if (alive) setPeople(data);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const head = people?.find((person) => person.is_head_hr);
  const employees = people?.filter((person) => !person.is_head_hr) || [];
  function personCard(person: Employee) {
    return (
      <Link
        className={`hierarchy-person ${person.is_head_hr ? "manager" : ""}`}
        href={`/hr/employees/${person.id}`}
      >
        <span className="avatar-initials" aria-hidden="true">
          {person.first_name[0]}
          {person.last_name[0]}
        </span>
        <span>
          <strong>
            {person.first_name} {person.last_name}
          </strong>
          <small>{person.is_head_hr ? "Head of HR" : person.designation}</small>
        </span>
      </Link>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Management Structure</h1>
          <p className="subtitle">
            All employees report directly to the Head of HR.
          </p>
        </div>
        <Link className="button primary" href="/hr/employees">
          People directory
        </Link>
      </div>
      <Feedback error={error} />
      {!people ? (
        !error && <Loading />
      ) : (
        <Card title="Company reporting structure">
          {head ? (
            <div
              className="hierarchy-scroll"
              tabIndex={0}
              aria-label="Two-level reporting map"
            >
              <ul className="hierarchy-tree">
                <li>
                  {personCard(head)}
                  {employees.length > 0 && (
                    <ul>
                      {employees.map((person) => (
                        <li key={person.id}>{personCard(person)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              </ul>
            </div>
          ) : (
            <p className="empty">
              Head of HR is unavailable. Contact your administrator.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
