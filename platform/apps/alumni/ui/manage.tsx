"use client";
import type { ProposalView } from "../refresh/review";
import { APP } from "./client";
import { StandingList, type ConfirmationStatus } from "./confirm";
import type { Network } from "./home";
import { ProposalList } from "./review";
import { useLoad } from "./use-load";

const SHOWN = 5;

/** One of the three admin jobs: a large number, what it counts, and the way in. */
function Task({
  count,
  label,
  first,
  action,
  children,
}: {
  count: number | null;
  label: string;
  /** Marks the job that needs doing now. */
  first?: boolean;
  action: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className={`al-card al-task${first ? " al-task-first" : ""}`}>
      <p className="al-number" aria-hidden="true">
        {count ?? "…"}
      </p>
      <h2 className="al-h3">
        <span className="sr-only">{count ?? "Loading"} </span>
        {label}
      </h2>
      {children}
      <a className={`al-btn${first ? " al-btn-dark" : ""}`} href={action.href}>
        {action.label}
      </a>
    </section>
  );
}

/** The admin overview: what needs doing, the changes waiting, and where alumni stand. */
export function ManageView() {
  const proposals = useLoad<{ proposals: ProposalView[] }>("proposals");
  const confirmations = useLoad<ConfirmationStatus>("confirmations");
  const network = useLoad<Network>("network");
  const pending = proposals.data?.proposals.length ?? null;
  const people = confirmations.data?.people ?? [];
  const due = confirmations.data ? people.filter((person) => person.due).length : null;
  const noEmail = people.filter((person) => !person.hasEmail).length;
  return (
    <>
      <div className="al-stack" style={{ gap: 8 }}>
        <h1 className="al-h1">Keep the network right</h1>
        <p className="al-lead">
          Three jobs, in the order they usually need doing. Only admins see this page.
        </p>
      </div>
      <div className="al-tasks">
        <Task
          count={pending}
          label={`${pending === 1 ? "change" : "changes"} waiting for your review`}
          first={Boolean(pending)}
          action={{ href: `${APP}/review`, label: "Review changes" }}
        >
          <p>
            The refresh files a change when a job looks different. Nothing changes until you approve
            it.
          </p>
        </Task>
        <Task
          count={due}
          label="alumni can be asked to confirm"
          action={{ href: `${APP}/confirm`, label: "Confirm details" }}
        >
          <p>
            {noEmail > 0 ? `${noEmail} more have no email on file. ` : ""}Nobody is emailed twice
            within a year.
          </p>
          {confirmations.data && !confirmations.data.ready && (
            <p className="al-note al-note-warn">
              Email is switched off, so nothing can be sent yet.
            </p>
          )}
        </Task>
        <Task
          count={network.data?.summary.alumni ?? null}
          label="alumni listed"
          action={{ href: `${APP}/add`, label: "Add alumni" }}
        >
          <p>Paste rows from the contact book to add more. People already here are skipped.</p>
        </Task>
      </div>

      <section className="al-stack" style={{ gap: 16 }} aria-labelledby="manage-review">
        <h2 id="manage-review" className="al-h2">
          Waiting for review
        </h2>
        <ProposalList level={3} onReviewed={proposals.reload} />
      </section>

      <section className="al-stack" style={{ gap: 16 }} aria-labelledby="manage-standing">
        <h2 id="manage-standing" className="al-h2">
          Where each alum stands
        </h2>
        {confirmations.loading ? (
          <p role="status">Loading where alumni stand…</p>
        ) : (
          <>
            <p className="al-muted">
              When someone replies to you by email, record what they said on their row.
            </p>
            <StandingList people={people.slice(0, SHOWN)} />
            {people.length > SHOWN && (
              <a className="al-more" href={`${APP}/confirm`}>
                See all {people.length}
              </a>
            )}
          </>
        )}
      </section>
    </>
  );
}
