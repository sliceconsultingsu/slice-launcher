"use client";
import { useState } from "react";
import type { StudentMatch } from "../data/reads";
import type { MyMatches } from "../matching/mine";
import { APP, formatDate, request } from "./client";
import { LoadError, useLoad } from "./use-load";

function statusMessage(matching: MyMatches["matching"]): string {
  switch (matching.status) {
    case "matched":
      return `You have ${matching.newMatches === 1 ? "a new match" : `${matching.newMatches} new matches`}. Your next set arrives on ${formatDate(matching.nextAt)}.`;
    case "not-due":
      return `Your next matches arrive on ${formatDate(matching.nextAt)}.`;
    case "nobody-left":
      return "You have been matched with every alum available. New matches will appear when more alumni join.";
    case "nothing-in-common":
      return "No alum shares your current answers yet. Update your profile to widen your matches.";
    case "profile-needed":
      return "Finish your profile to get matches.";
  }
}

function MatchCard({
  match,
  onChange,
}: {
  match: StudentMatch;
  onChange(next: StudentMatch): void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const record = async (outcome: StudentMatch["outcome"]) => {
    setSaving(true);
    setError(null);
    const next = match.outcome === outcome ? null : outcome;
    const result = await request(`me/matches/${encodeURIComponent(match.id)}/outcome`, {
      method: "POST",
      body: { outcome: next },
    });
    setSaving(false);
    if (result.ok) onChange({ ...match, outcome: next });
    else setError(result.error);
  };
  const alum = match.alum;
  return (
    <li className="alumni-card">
      {alum ? (
        <>
          <h3>
            <a href={`${APP}/alumni/${encodeURIComponent(alum.id)}`}>{alum.name}</a>
          </h3>
          <p>
            {alum.title && alum.employer
              ? `${alum.title} · ${alum.employer}`
              : "No current job on record"}
          </p>
          <p className="alumni-muted">Class of {alum.graduationYear}</p>
        </>
      ) : (
        <>
          <h3>No longer listed</h3>
          <p className="alumni-muted">This alum is no longer in the directory.</p>
        </>
      )}
      <h4 className="alumni-small">Why this match</h4>
      <ul>
        {match.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="alumni-small">Matched {formatDate(match.matchedAt)}</p>
      {alum && (
        <div className="alumni-actions">
          <button
            type="button"
            className={`secondary-button${match.outcome === "contacted" ? " alumni-pressed" : ""}`}
            aria-pressed={match.outcome === "contacted"}
            disabled={saving}
            onClick={() => void record("contacted")}
          >
            I contacted them
          </button>
          <button
            type="button"
            className={`secondary-button${match.outcome === "not-for-me" ? " alumni-pressed" : ""}`}
            aria-pressed={match.outcome === "not-for-me"}
            disabled={saving}
            onClick={() => void record("not-for-me")}
          >
            Not for me
          </button>
        </div>
      )}
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

export function MatchesView() {
  // Opening this screen also gives the next set of matches when one is due.
  const { data, error, loading, reload, replace } = useLoad<MyMatches>("me/matches", "POST");
  if (loading) return <p role="status">Loading your matches…</p>;
  if (error || !data)
    return <LoadError message={error ?? "We couldn’t load your matches."} retry={reload} />;
  const update = (next: StudentMatch) =>
    replace({ ...data, matches: data.matches.map((m) => (m.id === next.id ? next : m)) });
  const newest = data.matches[0]?.round;
  const current = data.matches.filter((match) => match.round === newest);
  const earlier = data.matches.filter((match) => match.round !== newest);
  return (
    <>
      <p className="notice" role="status">
        {statusMessage(data.matching)}{" "}
        {(data.matching.status === "nothing-in-common" ||
          data.matching.status === "profile-needed") && (
          <a href={`${APP}/profile`}>Update my profile</a>
        )}
      </p>
      <section aria-labelledby="current-matches">
        <h2 id="current-matches">Your matches</h2>
        {current.length ? (
          <ul className="alumni-grid">
            {current.map((match) => (
              <MatchCard key={match.id} match={match} onChange={update} />
            ))}
          </ul>
        ) : (
          <p>
            You have no matches yet. <a href={`${APP}/explore`}>Explore alumni</a> while you wait.
          </p>
        )}
      </section>
      {earlier.length > 0 && (
        <section aria-labelledby="earlier-matches">
          <div className="alumni-toolbar">
            <h2 id="earlier-matches">Earlier matches</h2>
          </div>
          <ul className="alumni-grid">
            {earlier.map((match) => (
              <MatchCard key={match.id} match={match} onChange={update} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
