"use client";
import { useState, type KeyboardEvent } from "react";
import type { AlumProfile, AlumSummary, MatchOutcome, StudentMatch } from "../data/reads";
import type { MyMatches } from "../matching/mine";
import { APP, formatDate } from "./client";
import { Icon } from "./icons";
import { currentSet, saveOutcome, waiting } from "./mine";
import { Face, PersonRow, profileHref } from "./people";
import { ReachOutDialog } from "./reach-out";
import { useLoad } from "./use-load";

function statusMessage(matching: MyMatches["matching"]): string {
  switch (matching.status) {
    case "matched":
      return `You have ${matching.newMatches === 1 ? "a new match" : `${matching.newMatches} new matches`}. Your next set arrives on ${formatDate(matching.nextAt)}.`;
    case "not-due":
      return `Your next matches arrive on ${formatDate(matching.nextAt)}.`;
    case "nobody-left":
      return "You have been matched with every alum available. New matches will appear when more alumni join.";
    case "nothing-in-common":
      return "No alum shares your current answers yet. Update your answers to widen your matches.";
    case "profile-needed":
      return "Finish your answers to get matches.";
  }
}

/** What the alum offers, read from their profile. Shows nothing while loading or when empty. */
function HelpOffered({ alumId }: { alumId: string }) {
  const { data } = useLoad<{ alum: AlumProfile }>(`alumni/${encodeURIComponent(alumId)}`);
  if (!data?.alum.helpOffered.length) return null;
  return (
    <div>
      <h3 className="al-eyebrow">Happy to help with</h3>
      <ul className="al-chips">
        {data.alum.helpOffered.map((kind) => (
          <li key={kind}>{kind}</li>
        ))}
      </ul>
    </div>
  );
}

/** One match in a side list, with what the student decided and a way to change it. */
function MatchRow({
  match,
  showing,
  busy,
  decide,
}: {
  match: StudentMatch;
  showing: boolean;
  busy: boolean;
  decide(match: StudentMatch, outcome: MatchOutcome | null): void;
}) {
  const { alum } = match;
  if (!alum)
    return (
      <PersonRow id={match.id} name="No longer listed" link={false}>
        <span className="al-small">This alum is no longer in the network.</span>
      </PersonRow>
    );
  return (
    <PersonRow id={alum.id} name={alum.name}>
      {showing ? (
        <span className="al-small">Showing now</span>
      ) : match.outcome ? (
        <span className="al-actions">
          <span className="al-small">
            {match.outcome === "contacted" ? "You reached out" : "Not for me"}
          </span>
          <button
            type="button"
            className="al-text-btn"
            disabled={busy}
            onClick={() => decide(match, null)}
          >
            Change<span className="sr-only"> what you decided about {alum.name}</span>
          </button>
        </span>
      ) : (
        <span className="al-small">Up next</span>
      )}
    </PersonRow>
  );
}

export function MatchesView({
  name,
  mine,
  onMine,
}: {
  name: string;
  mine: MyMatches;
  onMine(next: MyMatches): void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reaching, setReaching] = useState<string | null>(null);
  const set = currentSet(mine.matches);
  const queue = waiting(mine.matches);
  const shown = queue[0] ?? null;
  const earlier = mine.matches.filter((match) => !set.includes(match));
  const reached = mine.matches.find((match) => match.id === reaching) ?? null;

  const decide = async (match: StudentMatch, outcome: MatchOutcome | null) => {
    setBusy(true);
    setError(null);
    const result = await saveOutcome(mine, match, outcome);
    setBusy(false);
    if (result.mine) onMine(result.mine);
    else setError(result.error);
    return result.mine !== null;
  };
  // Pressing Reach out records it straight away, then opens the panel with a message to send.
  const reachOut = async (match: StudentMatch) => {
    if (await decide(match, "contacted")) setReaching(match.id);
  };
  const onKey = (event: KeyboardEvent<HTMLElement>, match: StudentMatch) => {
    if (event.target !== event.currentTarget || busy) return;
    if (event.key === "ArrowLeft") void decide(match, "not-for-me");
    if (event.key === "ArrowRight") void reachOut(match);
  };
  const job = (alum: AlumSummary) =>
    alum.title && alum.employer ? `${alum.title} at ${alum.employer}` : "No current job on record";

  return (
    <div className="al-split">
      <div className="al-main al-deck-col">
        <div className="al-stack" style={{ gap: 8 }}>
          <h1 className="al-h1">Meet your matches</h1>
          {shown && (
            <p className="al-lead">
              Match {set.indexOf(shown) + 1} of {set.length}
            </p>
          )}
          <p className="al-muted" role="status">
            {statusMessage(mine.matching)}
          </p>
        </div>
        {error && (
          <p className="al-note al-note-error" role="alert">
            {error}
          </p>
        )}
        {shown?.alum ? (
          <>
            <div className={`al-deck${queue.length === 1 ? " al-deck-last" : ""}`}>
              <article
                className="al-deck-card"
                aria-labelledby="deck-name"
                tabIndex={0}
                onKeyDown={(event) => onKey(event, shown)}
              >
                <Face id={shown.alum.id} name={shown.alum.name}>
                  <span className="al-progress" aria-hidden="true">
                    {set.map((match, index) => (
                      <span
                        key={match.id}
                        className={index <= set.indexOf(shown) ? "al-progress-on" : undefined}
                      />
                    ))}
                  </span>
                </Face>
                <div className="al-deck-body">
                  <div>
                    <h2 id="deck-name" className="al-deck-name">
                      {shown.alum.name}
                    </h2>
                    <p className="al-lead">{job(shown.alum)}</p>
                    <p className="al-muted">
                      {shown.alum.city && `${shown.alum.city}. `}Class of{" "}
                      {shown.alum.graduationYear}.
                    </p>
                  </div>
                  <div>
                    <h3 className="al-eyebrow">What you have in common</h3>
                    <ul className="al-reasons">
                      {shown.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <HelpOffered alumId={shown.alum.id} />
                </div>
              </article>
            </div>
            <div className="al-deck-actions">
              <button
                type="button"
                className="al-btn"
                disabled={busy}
                onClick={() => void decide(shown, "not-for-me")}
              >
                <Icon name="cross" />
                Not for me
              </button>
              <button
                type="button"
                className="al-btn al-btn-go"
                disabled={busy}
                onClick={() => void reachOut(shown)}
              >
                Reach out
                <Icon name="arrow" size={22} />
              </button>
              <a className="al-more" href={profileHref(shown.alum.id)}>
                Full profile<span className="sr-only"> of {shown.alum.name}</span>
              </a>
            </div>
            <p className="al-small">
              With the card selected, the left and right arrow keys also work.
            </p>
          </>
        ) : (
          <div className="al-card" style={{ alignItems: "center" }}>
            <h2 className="al-h2">
              {set.length ? "That is everyone in this set" : "No matches yet"}
            </h2>
            <p>
              {set.length
                ? "You can still change what you decided, or browse everyone."
                : "You can browse the whole network while you wait."}
            </p>
            <div className="al-actions">
              <a className="al-btn al-btn-dark" href={`${APP}/explore`}>
                Browse the network
              </a>
              {(mine.matching.status === "nothing-in-common" ||
                mine.matching.status === "profile-needed") && (
                <a className="al-btn" href={`${APP}/profile`}>
                  Update my answers
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="al-side al-stack">
        {set.length > 0 && (
          <section className="al-card al-card-dark" aria-labelledby="this-set">
            <h2 id="this-set" className="al-h3">
              This set
            </h2>
            <ol className="al-rows">
              {set.map((match) => (
                <li key={match.id}>
                  <MatchRow
                    match={match}
                    showing={match === shown}
                    busy={busy}
                    decide={(item, outcome) => void decide(item, outcome)}
                  />
                </li>
              ))}
            </ol>
          </section>
        )}
        {earlier.length > 0 && (
          <section className="al-card" aria-labelledby="earlier-matches">
            <h2 id="earlier-matches" className="al-h3">
              Earlier matches
            </h2>
            <ul className="al-rows">
              {earlier.map((match) => (
                <li key={match.id}>
                  {match.alum && !match.outcome ? (
                    <PersonRow id={match.alum.id} name={match.alum.name}>
                      <span className="al-actions">
                        <button
                          type="button"
                          className="al-text-btn"
                          disabled={busy}
                          onClick={() => void decide(match, "contacted")}
                        >
                          I reached out<span className="sr-only"> to {match.alum.name}</span>
                        </button>
                        <button
                          type="button"
                          className="al-text-btn"
                          disabled={busy}
                          onClick={() => void decide(match, "not-for-me")}
                        >
                          Not for me<span className="sr-only">: {match.alum.name}</span>
                        </button>
                      </span>
                    </PersonRow>
                  ) : (
                    <MatchRow
                      match={match}
                      showing={false}
                      busy={busy}
                      decide={(item, outcome) => void decide(item, outcome)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {reached?.alum && (
        <ReachOutDialog
          key={reached.id}
          alum={reached.alum}
          reasons={reached.reasons}
          studentName={name}
          nextName={shown?.alum?.name ?? null}
          onUndo={() => decide(reached, null)}
          onClose={() => setReaching(null)}
        />
      )}
    </div>
  );
}
