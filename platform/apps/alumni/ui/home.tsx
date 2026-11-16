"use client";
import type { ActivityItem, NetworkSummary } from "../data/network";
import type { MyMatches } from "../matching/mine";
import { APP, formatAgo, formatDate } from "./client";
import { Icon } from "./icons";
import { currentSet, matchWith, waiting } from "./mine";
import { PersonChip, Tile, firstNameOf, initialsOf, profileHref, shadeOf } from "./people";
import { LoadError, useLoad } from "./use-load";

export interface Network {
  summary: NetworkSummary;
  activity: ActivityItem[];
}
const COUNT_WORDS = ["No", "One", "Two", "Three"];

/** The headline, the line under it and the button, for where the student stands right now. */
function standing(name: string, mine: MyMatches) {
  const hello = firstNameOf(name) ? `Hey ${firstNameOf(name)}. ` : "";
  const left = waiting(mine.matches).length;
  const status = mine.matching;
  const next = "nextAt" in status ? ` Your next set arrives on ${formatDate(status.nextAt)}.` : "";
  if (left > 0)
    return {
      title: `${hello}${COUNT_WORDS[left] ?? left} ${left === 1 ? "alum is" : "alumni are"} still in your deck.`,
      detail: `Look at each one, then reach out or pass.${next}`,
      action: { href: `${APP}/matches`, label: "Meet your matches" },
    };
  if (mine.matches.length > 0)
    return {
      title: `${hello}You have been through this set.`,
      detail: next.trim() || "New matches appear when more alumni join.",
      action: { href: `${APP}/matches`, label: "See your matches" },
    };
  if (status.status === "nothing-in-common")
    return {
      title: `${hello}No matches yet.`,
      detail: "No alum shares your current answers. Widen them to get matches.",
      action: { href: `${APP}/profile`, label: "Update my answers" },
    };
  return {
    title: `${hello}No matches yet.`,
    detail: "Matches appear here once alumni have been added. You can browse in the meantime.",
    action: { href: `${APP}/explore`, label: "Browse the network" },
  };
}

function ActivityEntry({ item, mine }: { item: ActivityItem; mine: MyMatches }) {
  const when = <span className="al-small">{formatAgo(item.at)}</span>;
  if (item.kind === "joined") {
    const [first] = item.alumni;
    return (
      <li>
        <span aria-hidden="true" className="al-tile al-tile-md al-tile-plain">
          +{item.count}
        </span>
        <div>
          <p className="al-feed-line">
            {item.count === 1 && first ? (
              <>
                <a href={profileHref(first.id)}>{first.name}</a> joined the network.
              </>
            ) : (
              <>
                <strong>{item.count} alumni</strong> joined the network.
              </>
            )}
          </p>
          {item.count > 1 && (
            <ul className="al-actions" aria-label="Some of them">
              {item.alumni.map((alum) => (
                <li key={alum.id}>
                  <PersonChip {...alum} />
                </li>
              ))}
            </ul>
          )}
          {when}
        </div>
      </li>
    );
  }
  const { alum } = item;
  return (
    <li>
      <Tile id={alum.id} name={alum.name} size="md" />
      <div>
        {item.kind === "job" ? (
          <>
            <p className="al-feed-line">
              <a href={profileHref(alum.id)}>{alum.name}</a>{" "}
              {item.moved ? (
                <>
                  moved to <strong>{item.employer}</strong> as {item.title}.
                </>
              ) : (
                <>
                  is now <strong>{item.title}</strong> at {item.employer}.
                </>
              )}
            </p>
            {item.before && <p className="al-muted">Before: {item.before}.</p>}
          </>
        ) : (
          <>
            <p className="al-feed-line">
              <a href={profileHref(alum.id)}>{alum.name}</a> is happy to help with:
            </p>
            <ul className="al-chips">
              {item.help.map((kind) => (
                <li key={kind}>{kind}</li>
              ))}
            </ul>
          </>
        )}
        <div className="al-actions">
          {when}
          {matchWith(mine, alum.id) && <span className="al-badge al-badge-warm">Your match</span>}
        </div>
      </div>
    </li>
  );
}

export function HomeView({ name, mine }: { name: string; mine: MyMatches }) {
  const network = useLoad<Network>("network");
  const { title, detail, action } = standing(name, mine);
  const set = currentSet(mine.matches).flatMap((match) => (match.alum ? [match.alum] : []));
  // The best match sits at the front of the fan, which is the last one drawn.
  const fan = [set[1], set[2], set[0]].filter((alum) => alum !== undefined);
  const reached = mine.matches.filter((match) => match.outcome === "contacted").length;
  const summary = network.data?.summary;
  const most = Math.max(1, ...(summary?.employers.map((employer) => employer.alumni) ?? []));
  return (
    <>
      <section className="al-hero" aria-labelledby="home-title">
        <svg aria-hidden="true" className="al-hero-slice" viewBox="0 0 200 200">
          <path d="M200 200 L6 200 A194 194 0 0 1 200 6 Z" fill="#ffa466" />
          <path
            d="M200 200 L34 196 M200 200 L54 114 M200 200 L114 54 M200 200 L196 34"
            stroke="#ff8a3d"
            strokeWidth="7"
            fill="none"
          />
        </svg>
        <div className="al-hero-text">
          <p className="al-eyebrow">{new Date().toLocaleDateString("en-US", { month: "long" })}</p>
          <h1 id="home-title" className="al-h1">
            {title}
          </h1>
          <p className="al-lead">{detail}</p>
          <a className="al-btn al-btn-dark" href={action.href}>
            {action.label}
            <Icon name="arrow" />
          </a>
        </div>
        {fan.length > 0 && (
          <div className="al-fan" aria-hidden="true">
            {fan.map((alum) => (
              <span key={alum.id} className={`al-c${shadeOf(alum.id)}`}>
                <span>{initialsOf(alum.name)}</span>
                <span>{alum.name}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="al-split">
        <section className="al-card al-main" aria-labelledby="lately">
          <h2 id="lately" className="al-h2">
            Lately in the network
          </h2>
          {network.loading ? (
            <p role="status">Loading what changed…</p>
          ) : network.error || !network.data ? (
            <LoadError
              message={network.error ?? "We couldn’t load what changed."}
              retry={network.reload}
            />
          ) : network.data.activity.length === 0 ? (
            <p>Nothing has changed lately.</p>
          ) : (
            <ol className="al-feed">
              {network.data.activity.map((item) => (
                <ActivityEntry
                  key={`${item.kind}-${item.at}-${item.kind === "joined" ? item.count : item.alum.id}`}
                  item={item}
                  mine={mine}
                />
              ))}
            </ol>
          )}
        </section>

        <div className="al-stack al-side">
          <section className="al-card al-card-dark" aria-labelledby="so-far">
            <h2 id="so-far" className="al-eyebrow al-muted">
              You so far
            </h2>
            <dl className="al-stats">
              <div>
                <dt>alumni matched</dt>
                <dd>{mine.matches.length}</dd>
              </div>
              <div>
                <dt>reached out to</dt>
                <dd>{reached}</dd>
              </div>
            </dl>
          </section>
          {summary && summary.employers.length > 0 && (
            <section className="al-card" aria-labelledby="where">
              <h2 id="where" className="al-h3">
                Where alumni work
              </h2>
              <ul className="al-bars">
                {summary.employers.map((employer) => (
                  <li key={employer.name}>
                    <a href={`${APP}/explore?q=${encodeURIComponent(employer.name)}`}>
                      <span>
                        <span>{employer.name}</span>
                        <span>{employer.alumni}</span>
                      </span>
                      <span className="al-bar-track" aria-hidden="true">
                        <span style={{ width: `${(employer.alumni / most) * 100}%` }} />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              <a className="al-more" href={`${APP}/explore`}>
                Browse all {summary.alumni} alumni
              </a>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
