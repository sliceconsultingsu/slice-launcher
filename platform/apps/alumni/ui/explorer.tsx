"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { AlumSummary, Lists, SearchPage } from "../data/reads";
import { APP, formatDate, request } from "./client";
import { LoadError, useLoad } from "./use-load";

const EMPTY = {
  q: "",
  industry: "",
  school: "",
  major: "",
  city: "",
  help: "",
  yearFrom: "",
  yearTo: "",
  sort: "name",
  includeHidden: "",
};
type Filters = typeof EMPTY;
type FilterKey = keyof Filters;

function fromAddress(): Filters {
  const params = new URLSearchParams(window.location.search);
  const filters = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as FilterKey[]) filters[key] = params.get(key) ?? EMPTY[key];
  return filters;
}
function toQuery(filters: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value && !(key === "sort" && value === "name")) params.set(key, value);
  return params.toString();
}

export function AlumCard({ alum }: { alum: AlumSummary }) {
  return (
    <li className="alumni-card">
      <h3>
        <a href={`${APP}/alumni/${encodeURIComponent(alum.id)}`}>{alum.name}</a>
      </h3>
      <p>
        {alum.title && alum.employer
          ? `${alum.title} · ${alum.employer}`
          : "No current job on record"}
      </p>
      <p className="alumni-muted">
        Class of {alum.graduationYear}
        {alum.majors.length > 0 && ` · ${alum.majors.join(", ")}`}
      </p>
      {alum.hidden && <span className="status-badge status-suspended">Hidden from members</span>}
    </li>
  );
}

export function ExplorerView({ admin }: { admin: boolean }) {
  const lists = useLoad<Lists>("lists");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<SearchPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // The filters live in the address, so a search can be shared and survives a reload.
  useEffect(() => {
    const initial = fromAddress();
    setFilters(initial);
    setDraft(initial);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const query = toQuery(filters);
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    setLoading(true);
    setError(null);
    void request<SearchPage>(`alumni?${query}`, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setPage(result.data);
      setError(result.error);
      setLoading(false);
    });
    return () => controller.abort();
  }, [filters, ready, attempt]);

  const apply = (next: Filters) => {
    setDraft(next);
    setFilters(next);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(draft);
  };
  const showMore = async () => {
    if (!page || page.nextOffset === null) return;
    setLoading(true);
    const result = await request<SearchPage>(
      `alumni?${toQuery(filters)}&offset=${page.nextOffset}`,
    );
    setLoading(false);
    if (result.data)
      setPage({ ...result.data, results: [...page.results, ...result.data.results] });
    else setError(result.error);
  };
  const select = (key: FilterKey, label: string, choices: { id: string; name: string }[]) => (
    <label>
      {label}
      <select
        value={draft[key]}
        onChange={(event) => apply({ ...draft, [key]: event.target.value })}
      >
        <option value="">Any</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    </label>
  );
  const filtered = toQuery({ ...filters, sort: "name" }) !== "";
  const choices = lists.data;
  return (
    <>
      <form className="form-stack" onSubmit={submit} role="search" aria-label="Search alumni">
        <div className="alumni-filters">
          <label className="alumni-wide">
            Search by name or employer
            <input
              type="search"
              value={draft.q}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            />
          </label>
          {select("industry", "Industry", choices?.industries ?? [])}
          {select("school", "School", choices?.schools ?? [])}
          {select("major", "Major", choices?.majors ?? [])}
          {select("city", "City", choices?.cities ?? [])}
          {select("help", "Help offered", choices?.helpKinds ?? [])}
          <label>
            Graduated from
            <input
              type="number"
              inputMode="numeric"
              min={1950}
              max={2100}
              value={draft.yearFrom}
              onChange={(event) => setDraft({ ...draft, yearFrom: event.target.value })}
            />
          </label>
          <label>
            Graduated up to
            <input
              type="number"
              inputMode="numeric"
              min={1950}
              max={2100}
              value={draft.yearTo}
              onChange={(event) => setDraft({ ...draft, yearTo: event.target.value })}
            />
          </label>
          <label>
            Sort by
            <select
              value={draft.sort}
              onChange={(event) => apply({ ...draft, sort: event.target.value })}
            >
              <option value="name">Name</option>
              <option value="year">Graduation year</option>
              <option value="checked">Most recently checked</option>
            </select>
          </label>
        </div>
        {admin && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.includeHidden === "1"}
              onChange={(event) =>
                apply({ ...draft, includeHidden: event.target.checked ? "1" : "" })
              }
            />
            Include alumni hidden from members
          </label>
        )}
        <div className="alumni-actions">
          <button type="submit" className="primary-button">
            Search alumni
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!filtered}
            onClick={() => apply(EMPTY)}
          >
            Clear filters
          </button>
        </div>
      </form>
      {lists.error && (
        <LoadError message="We couldn’t load the filter choices." retry={lists.reload} />
      )}
      <section aria-labelledby="alumni-results">
        <div className="alumni-toolbar">
          <h2 id="alumni-results">Alumni</h2>
          <span className="alumni-muted" role="status">
            {loading
              ? "Loading alumni…"
              : page
                ? `${page.total} ${page.total === 1 ? "alum" : "alumni"}`
                : ""}
          </span>
        </div>
        {error ? (
          <LoadError message={error} retry={() => setAttempt((value) => value + 1)} />
        ) : page && page.results.length === 0 && !loading ? (
          <p>
            No alumni found.{" "}
            {filtered
              ? "Clear the filters to see everyone."
              : "Alumni will appear here once they are added."}
          </p>
        ) : (
          <ul className="alumni-grid">
            {page?.results.map((alum) => (
              <AlumCard key={alum.id} alum={alum} />
            ))}
          </ul>
        )}
        {page && page.nextOffset !== null && !error && (
          <div className="alumni-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={loading}
              onClick={() => void showMore()}
            >
              Show more alumni
            </button>
          </div>
        )}
        {page && page.results.some((alum) => alum.lastCheckedAt) && filters.sort === "checked" && (
          <p className="alumni-small">
            Most recent check: {formatDate(page.results[0]?.lastCheckedAt ?? null)}
          </p>
        )}
      </section>
    </>
  );
}
