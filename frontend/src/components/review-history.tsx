"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { human } from "@/lib/reviews";
import type { Page } from "@/lib/types";
import type {
  HistoricalPillar,
  HistoricalReview,
  HistoryPerson,
  ReviewHistoryData,
} from "@/lib/review-history";
import { useSession } from "./shell";
import { Badge, Button, Card, Feedback, Loading } from "./ui";
import styles from "./review-history.module.css";

const cycleName = (kind: string) =>
  kind === "MID_YEAR" ? "Mid-Year" : "Year-End";
const shown = (value?: string | null) => value || "Not recorded";
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export function ReviewHistory({ chief = false }: { chief?: boolean }) {
  const session = useSession();
  return (
    <HistoryWorkspace key={`${session.company_id}:${chief}`} chief={chief} />
  );
}

function HistoryWorkspace({ chief }: { chief: boolean }) {
  const [person, setPerson] = useState<HistoryPerson | null>(null);
  const [year, setYear] = useState<number | null>(null);
  return (
    <div className={styles.workspace}>
      <div>
        <p className="eyebrow">HUMAN ASSESSMENT · FORMAL RECORDS</p>
        <h1>Review History</h1>
        <p className="subtitle">
          Explore Mid-Year and Year-End reviews, agreed commitments and the
          human assessments behind them.
        </p>
      </div>
      {chief && (
        <PersonSelector
          selected={person}
          onSelect={(p) => {
            setPerson(p);
            setYear(null);
          }}
        />
      )}
      {chief && !person ? (
        <Card>
          <p>Choose a Steward Guy to view review history.</p>
        </Card>
      ) : (
        <HistoryLoader
          key={`${person?.id || "own"}:${year || "latest"}`}
          chief={chief}
          employeeId={person?.id}
          year={year}
          onYear={setYear}
        />
      )}
    </div>
  );
}

function PersonSelector({
  selected,
  onSelect,
}: {
  selected: HistoryPerson | null;
  onSelect: (p: HistoryPerson | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  return (
    <Card title="Review history for">
      <label>
        Search Steward Guys
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Name, title or department"
        />
      </label>
      <PeopleOptions
        key={`${query}:${page}`}
        query={query}
        page={page}
        selected={selected}
        onSelect={onSelect}
        onPage={setPage}
      />
      {selected && (
        <div className={styles.person}>
          {selected.photo_url && (
            <Image
              src={selected.photo_url}
              alt=""
              width={40}
              height={40}
              unoptimized
            />
          )}
          <p>
            <strong>{selected.name}</strong>
            <br />
            {[selected.designation, selected.department]
              .filter(Boolean)
              .join(" · ")}
            {!selected.active && " · Inactive"}
          </p>
          <Button variant="neutral" onClick={() => onSelect(null)}>
            Clear selection
          </Button>
        </div>
      )}
    </Card>
  );
}

function PeopleOptions({
  query,
  page,
  selected,
  onSelect,
  onPage,
}: {
  query: string;
  page: number;
  selected: HistoryPerson | null;
  onSelect: (p: HistoryPerson) => void;
  onPage: (p: number) => void;
}) {
  const [data, setData] = useState<Page<HistoryPerson> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<Page<HistoryPerson>>(
      `review-history/people/?search=${encodeURIComponent(query)}&page=${page}`,
    )
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [query, page]);
  if (error) return <Feedback error={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <label>
        Choose a Steward Guy
        <select
          value={
            data.results.some((p) => p.id === selected?.id) ? selected!.id : ""
          }
          onChange={(e) => {
            const person = data.results.find((p) => p.id === e.target.value);
            if (person) onSelect(person);
          }}
        >
          <option value="">Select from search results</option>
          {data.results.map((p) => (
            <option key={p.id} value={p.id}>
              {[
                p.name,
                p.designation,
                p.department,
                !p.active ? "Inactive" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </option>
          ))}
        </select>
      </label>
      {!data.results.length && <p>No Steward Guys match this search.</p>}
      {(data.previous || data.next) && (
        <div className="actions">
          <Button
            variant="neutral"
            disabled={!data.previous}
            onClick={() => onPage(page - 1)}
          >
            Previous people
          </Button>
          <span>Page {page}</span>
          <Button
            variant="neutral"
            disabled={!data.next}
            onClick={() => onPage(page + 1)}
          >
            Next people
          </Button>
        </div>
      )}
    </>
  );
}

function HistoryLoader({
  chief,
  employeeId,
  year,
  onYear,
}: {
  chief: boolean;
  employeeId?: string;
  year: number | null;
  onYear: (y: number) => void;
}) {
  const [data, setData] = useState<ReviewHistoryData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams();
    if (employeeId) query.set("employee_id", employeeId);
    if (year) query.set("year", String(year));
    api<ReviewHistoryData>(`review-history/?${query}`)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [employeeId, year]);
  if (error) return <Feedback error={error} />;
  if (!data) return <Loading />;
  return <HistoryComparison data={data} chief={chief} onYear={onYear} />;
}

function ReviewHeader({
  review,
  kind,
  year,
  base,
}: {
  review: HistoricalReview | null;
  kind: string;
  year: number | null;
  base: string;
}) {
  return (
    <Card title={`${cycleName(kind)} ${year}`}>
      {review ? (
        <>
          <Badge>
            {review.state === "FINALISED"
              ? "Finalised"
              : `Incomplete · ${human(review.state)}`}
          </Badge>
          <h3>
            {review.state === "FINALISED"
              ? shown(review.overall)
              : "Human assessment not yet finalised"}
          </h3>
          {review.finalised_at && <p>Finalised {date(review.finalised_at)}</p>}
          <Link href={`${base}/${review.id}`}>
            {review.state === "FINALISED" ? "View final record" : "Open review"}{" "}
            →
          </Link>
        </>
      ) : (
        <p>
          {kind === "MID_YEAR"
            ? "Mid-Year review is not available for this year."
            : "Year-End review has not been finalised yet."}
        </p>
      )}
    </Card>
  );
}

function PillarDetails({
  value,
  label,
}: {
  value: HistoricalPillar | null;
  label: string;
}) {
  return (
    <div>
      <h3>{label}</h3>
      {value ? (
        <dl className={styles.fields}>
          {(
            [
              ["Target", value.target],
              ["Success measure", value.success_measure],
              ["Target notes", value.notes],
              ["Steward Guy reflection", value.reflection],
              ["Chief Steward appraisal", value.appraisal],
              ["Outcome against target", value.outcome],
              ["Pillar judgement", value.judgement],
            ] as const
          ).map(([label, text]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{shown(text)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>No finalised pillar record available.</p>
      )}
    </div>
  );
}

export function HistoryComparison({
  data,
  chief,
  onYear,
}: {
  data: ReviewHistoryData;
  chief: boolean;
  onYear: (y: number) => void;
}) {
  const base = chief ? "/hr/reviews" : "/employee/reviews";
  if (!data.available_years.length)
    return (
      <Card>
        <p>
          {chief
            ? "No formal review history is available for this Steward Guy."
            : "No formal review history is available yet."}
        </p>
      </Card>
    );
  return (
    <>
      <div className={styles.years} aria-label="Review year">
        {data.available_years.length === 1 ? (
          <h2>{data.selected_year}</h2>
        ) : (
          data.available_years.map((year) => (
            <Button
              key={year}
              variant={year === data.selected_year ? "primary" : "neutral"}
              aria-pressed={year === data.selected_year}
              onClick={() => onYear(year)}
            >
              {year}
            </Button>
          ))
        )}
      </div>
      <div className={styles.pair}>
        <ReviewHeader
          review={data.mid_year}
          kind="MID_YEAR"
          year={data.selected_year}
          base={base}
        />
        <ReviewHeader
          review={data.year_end}
          kind="YEAR_END"
          year={data.selected_year}
          base={base}
        />
      </div>
      <Card title="Overall progress">
        <p className={styles.progress}>{data.overall_progress}</p>
        <small>
          Human assessment categories are shown without invented scores or
          rankings. Only finalised records are compared.
        </small>
      </Card>
      <Card title="Pillar comparison">
        
        {data.pillar_comparison.map((p) => (
          <details className={styles.pillar} key={p.pillar}>
            <summary>
              <span>{human(p.pillar)}</span>
              <strong>{p.progress}</strong>
            </summary>
            <p>
              Outcome: {p.mid_year?.outcome || "Not recorded"} →{" "}
              {p.year_end?.outcome || "Not recorded"}
            </p>
            <p>Pillar judgement: {p.judgement_change}</p>
            <div className={styles.pair}>
              <PillarDetails value={p.mid_year} label="Mid-Year" />
              <PillarDetails value={p.year_end} label="Year-End" />
            </div>
          </details>
        ))}
      </Card>
      <Card title="Commitment progress">
        <p className="chart-subtitle">
          Original Mid-Year commitments alongside explicitly recorded Year-End
          outcomes. Current tracking status may reflect updates made after
          Year-End.
        </p>
        {!data.commitments.length ? (
          <p>No commitments recorded in the finalised Mid-Year review.</p>
        ) : (
          data.commitments.map((c) => (
            <details className={styles.pillar} key={c.id}>
              <summary>{c.action}</summary>
              <div className={styles.pair}>
                <div>
                  <h3>Commitment created at Mid-Year</h3>
                  <dl className={styles.fields}>
                    <div>
                      <dt>Owner</dt>
                      <dd>{c.owner}</dd>
                    </div>
                    <div>
                      <dt>Due date</dt>
                      <dd>{shown(c.due_date)}</dd>
                    </div>
                    <div>
                      <dt>Success measure</dt>
                      <dd>{shown(c.success_measure)}</dd>
                    </div>
                    <div>
                      <dt>Support needed</dt>
                      <dd>{shown(c.support)}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h3>Year-End record</h3>
                  <p>
                    {c.year_end_outcome
                      ? human(c.year_end_outcome)
                      : "No Year-End outcome recorded for this commitment."}
                  </p>
                  {c.year_end_rationale && <p>{c.year_end_rationale}</p>}
                  <p>Current tracking status: {shown(c.current_status)}</p>
                </div>
              </div>
            </details>
          ))
        )}
      </Card>
      <Card title="Final human summaries">
        <div className={styles.pair}>
          {([data.mid_year, data.year_end] as const).map((r, i) => (
            <div key={i}>
              <h3>{i === 0 ? "Mid-Year" : "Year-End"} · Human assessment</h3>
              <p>
                {r?.state === "FINALISED" ? shown(r.overall) : "Not finalised"}
              </p>
              <p className={styles.prose}>
                {r?.state === "FINALISED"
                  ? shown(r.summary)
                  : "A final human summary is not available yet."}
              </p>
              {r?.state === "FINALISED" && <small>{r.source}</small>}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Historical reviews">
        <ul className={styles.history}>
          {data.history.map((r) => (
            <li key={r.id}>
              <div>
                <strong>
                  {cycleName(r.kind)} {r.year}
                </strong>
                <p>
                  {r.state === "FINALISED"
                    ? `Finalised · ${shown(r.overall)}`
                    : `Incomplete · ${human(r.state)}`}
                </p>
                {r.finalised_at && (
                  <small>Finalised {date(r.finalised_at)}</small>
                )}
              </div>
              <Link href={`${base}/${r.id}`}>
                {r.state === "FINALISED" ? "View final record" : "Open review"}{" "}
                →
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
