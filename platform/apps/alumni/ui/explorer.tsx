"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { AlumSummary, Choice, Lists, SearchPage } from "../data/reads";
import type { MyMatches } from "../matching/mine";
import { request } from "./client";
import type { Network } from "./home";
import { Icon } from "./icons";
import { matchWith } from "./mine";
import { Face, profileHref } from "./people";
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
const used = (all: Choice[] = [], ids: string[] = []) =>
  all.filter((choice) => ids.includes(choice.id));

export function AlumCard({ alum, mine }: { alum: AlumSummary; mine: MyMatches | null }) {
  const match = matchWith(mine, alum.id);
  return (
    <li className="al-person">
      <Face id={alum.id} name={alum.name}>
        {alum.hidden ? (
          <span className="al-badge">Hidden from members</span>
        ) : match?.outcome === "contacted" ? (
          <span className="al-badge al-badge-done">You reached out</span>
        ) : (
          match && <span className="al-badge al-badge-match">Your match</span>
        )}
      </Face>
      <span className="al-person-text">
        <a className="al-person-name al-h3" href={profileHref(alum.id)}>
          {alum.name}
        </a>
        <span>{alum.title ?? "No current job on record"}</span>
        <span className="al-small">
          {alum.employer && `${alum.employer}. `}Class of {alum.graduationYear}.
        </span>
      </span>
    </li>
  );
}

export function ExplorerView({ admin, mine }: { admin: boolean; mine: MyMatches | null }) {
  const lists = useLoad<Lists>("lists");
  const network = useLoad<Network>("network");
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
  // A filter is offered only when at least one listed alum has that detail, so the screen
  // follows what the alumni records actually hold.
  const select = (key: FilterKey, label: string, any: string, choices: Choice[]) =>
    choices.length === 0 ? null : (
      <label>
        <span className="sr-only">{label}</span>
        <select
          value={draft[key]}
          onChange={(event) => apply({ ...draft, [key]: event.target.value })}
        >
          <option value="">{any}</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </select>
      </label>
    );
  const year = (key: "yearFrom" | "yearTo", label: string, hint: string) => (
    <label>
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1950}
        max={2100}
        placeholder={hint}
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
    </label>
  );
  const filtered = toQuery({ ...filters, sort: "name" }) !== "";
  const choices = lists.data;
  const summary = network.data?.summary;
  const industries = used(choices?.industries, choices?.inUse.industries);
  const sizeOf = (id: string) => summary?.industries.find((item) => item.id === id)?.alumni;
  return (
    <>
      <form className="al-stack" onSubmit={submit} role="search" aria-label="Search alumni">
        <div className="al-page-head">
          <div>
            <h1 className="al-h1">The network</h1>
            {summary && (
              <p className="al-lead">
                {summary.alumni} Slice alumni, across {summary.companies}{" "}
                {summary.companies === 1 ? "company" : "companies"}.
              </p>
            )}
          </div>
          <div className="al-search">
            <Icon name="search" size={20} />
            <label className="sr-only" htmlFor="alumni-search">
              Search by name or company
            </label>
            <input
              id="alumni-search"
              type="search"
              placeholder="Search by name or company"
              value={draft.q}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            />
            <button type="submit">Search</button>
          </div>
        </div>

        {industries.length > 0 && (
          <div className="al-pills" role="group" aria-label="Industry">
            <button
              type="button"
              aria-pressed={draft.industry === ""}
              onClick={() => apply({ ...draft, industry: "" })}
            >
              Everyone {summary && <span>{summary.alumni}</span>}
            </button>
            {industries.map((industry) => (
              <button
                key={industry.id}
                type="button"
                aria-pressed={draft.industry === industry.id}
                onClick={() => apply({ ...draft, industry: industry.id })}
              >
                {industry.name}{" "}
                {sizeOf(industry.id) !== undefined && <span>{sizeOf(industry.id)}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="al-filter-row">
          {select("school", "School", "Any school", used(choices?.schools, choices?.inUse.schools))}
          {select("major", "Major", "Any major", used(choices?.majors, choices?.inUse.majors))}
          {select("city", "City", "Any city", choices?.cities ?? [])}
          {select(
            "help",
            "Help offered",
            "Any kind of help",
            used(choices?.helpKinds, choices?.inUse.helpKinds),
          )}
          {year("yearFrom", "Graduated from", "From year")}
          {year("yearTo", "Graduated up to", "To year")}
          <label>
            <span className="sr-only">Sort by</span>
            <select
              value={draft.sort}
              onChange={(event) => apply({ ...draft, sort: event.target.value })}
            >
              <option value="name">Sorted by name</option>
              <option value="year">Newest class first</option>
              <option value="checked">Most recently checked</option>
            </select>
          </label>
          {admin && (
            <label className="al-check">
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
          {filtered && (
            <button type="button" className="al-text-btn" onClick={() => apply(EMPTY)}>
              Clear filters
            </button>
          )}
          <span role="status">
            {loading
              ? "Loading alumni…"
              : page
                ? `${page.total} ${page.total === 1 ? "alum" : "alumni"}`
                : ""}
          </span>
        </div>
        {lists.error && (
          <LoadError message="We couldn’t load the filter choices." retry={lists.reload} />
        )}
      </form>

      <section className="al-stack" aria-label="Alumni">
        {error ? (
          <LoadError message={error} retry={() => setAttempt((value) => value + 1)} />
        ) : page && page.results.length === 0 && !loading ? (
          <p className="al-note">
            No alumni found.{" "}
            {filtered
              ? "Clear the filters to see everyone."
              : "Alumni will appear here once they are added."}
          </p>
        ) : (
          <ul className="al-people">
            {page?.results.map((alum) => (
              <AlumCard key={alum.id} alum={alum} mine={mine} />
            ))}
          </ul>
        )}
        {page && page.nextOffset !== null && !error && (
          <div className="al-actions" style={{ justifyContent: "center" }}>
            <button
              type="button"
              className="al-btn"
              disabled={loading}
              onClick={() => void showMore()}
            >
              Show more alumni
            </button>
          </div>
        )}
      </section>
    </>
  );
}
