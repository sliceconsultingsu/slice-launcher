"use client";
import { useState } from "react";
import type { ConfirmationMessage } from "../confirmation/message";
import type { ConfirmationPerson, SendResult } from "../confirmation/send";
import { AdminHead } from "./admin-head";
import { APP, formatDate, request } from "./client";
import { PersonRow } from "./people";
import { LoadError, useLoad } from "./use-load";

export interface ConfirmationStatus {
  /** False until the maintainer has set up the mail service. */
  ready: boolean;
  people: ConfirmationPerson[];
  example: ConfirmationMessage;
}

function standing(person: ConfirmationPerson): { text: string; badge: string } {
  if (person.answeredAt && (!person.askedAt || person.answeredAt >= person.askedAt))
    return { text: `Answered ${formatDate(person.answeredAt)}`, badge: "al-badge-done" };
  if (person.askedAt)
    return { text: `Asked ${formatDate(person.askedAt)}`, badge: "al-badge-wait" };
  if (person.failedAt)
    return { text: `Email refused ${formatDate(person.failedAt)}`, badge: "al-badge-warm" };
  if (!person.hasEmail) return { text: "No email on file", badge: "" };
  return { text: "Not asked yet", badge: "" };
}

/** Each alum with where they stand and the link to record what they replied. */
export function StandingList({ people }: { people: ConfirmationPerson[] }) {
  if (people.length === 0) return <p className="al-note">No alumni are listed yet.</p>;
  return (
    <ul className="al-table">
      {people.map((person) => {
        const { text, badge } = standing(person);
        return (
          <li key={person.personId}>
            <PersonRow id={person.personId} name={person.fullName} />
            <span className={`al-badge ${badge}`}>{text}</span>
            <a
              className="al-more"
              href={`${APP}/alumni/${encodeURIComponent(person.personId)}/reply`}
            >
              Record their reply<span className="sr-only"> for {person.fullName}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function ConfirmView() {
  const { data, error, loading, reload } = useLoad<ConfirmationStatus>("confirmations");
  const [asking, setAsking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; failed: boolean } | null>(null);
  const head = (
    <AdminHead
      title="Confirm alumni details"
      lead="The app emails each listed alum once, asking them to confirm their job and say which contact details they are happy to share. Their reply comes to your own email. Record it here and the network is updated."
    />
  );
  if (loading)
    return (
      <>
        {head}
        <p role="status">Loading who can be asked…</p>
      </>
    );
  if (error || !data)
    return (
      <>
        {head}
        <LoadError message={error ?? "We couldn’t load this page."} retry={reload} />
      </>
    );
  const due = data.people.filter((person) => person.due).length;
  const noEmail = data.people.filter((person) => !person.hasEmail).length;
  const send = async () => {
    setAsking(false);
    setOutcome(null);
    let sent = 0;
    let refused = 0;
    let stopped: string | null = null;
    // The app sends a few at a time, so keep asking until nobody is left or something stops it.
    for (let round = 0; round < 50; round++) {
      setProgress(`Sending… ${sent} sent so far.`);
      const result = await request<SendResult>("confirmations/send", { method: "POST", body: {} });
      if (!result.data) {
        stopped = result.error ?? "That did not work.";
        break;
      }
      sent += result.data.sent;
      refused += result.data.failed;
      stopped = result.data.stopped;
      if (stopped || result.data.remaining === 0 || result.data.sent + result.data.failed === 0)
        break;
    }
    setProgress(null);
    setOutcome({
      text: `${sent} ${sent === 1 ? "email" : "emails"} sent.${refused ? ` The mail service refused ${refused}; they will be tried again after a day.` : ""}${stopped ? ` Sending stopped: ${stopped}` : ""}`,
      failed: Boolean(stopped),
    });
    reload();
  };
  return (
    <>
      {head}
      {!data.ready && (
        <p className="al-note al-note-warn" role="status">
          Email is not set up yet, so nothing can be sent. The Slice maintainer switches it on.
        </p>
      )}
      {outcome && (
        <p
          className={`al-note ${outcome.failed ? "al-note-error" : "al-note-ok"}`}
          role={outcome.failed ? "alert" : "status"}
        >
          {outcome.text}
        </p>
      )}
      {progress && <p role="status">{progress}</p>}
      <section className="al-card">
        <h2 className="al-h2">
          {due} {due === 1 ? "alum" : "alumni"} can be asked now
        </h2>
        <p className="al-muted">
          {noEmail > 0 &&
            `${noEmail} ${noEmail === 1 ? "has" : "have"} no email on file and cannot be asked this way. `}
          Nobody is emailed twice within a year.
        </p>
        <details>
          <summary>Read the email before sending</summary>
          <div className="al-stack" style={{ gap: 8 }}>
            <p className="al-small">Shown with an invented alum. Each person sees their own job.</p>
            <p>
              <strong>{data.example.subject}</strong>
            </p>
            <p className="al-email">{data.example.text}</p>
          </div>
        </details>
        <div className="al-actions">
          {asking ? (
            <>
              <button type="button" className="al-btn al-btn-dark" onClick={() => void send()}>
                Yes, send {due} {due === 1 ? "email" : "emails"}
              </button>
              <button type="button" className="al-btn" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="al-btn al-btn-dark"
              disabled={!data.ready || due === 0 || progress !== null}
              onClick={() => setAsking(true)}
            >
              Send confirmation emails
            </button>
          )}
        </div>
        {asking && (
          <p className="al-small" role="status">
            These are real emails to real people and cannot be taken back.
          </p>
        )}
      </section>
      <section className="al-stack" style={{ gap: 16 }} aria-labelledby="confirm-people">
        <h2 id="confirm-people" className="al-h2">
          Where each alum stands
        </h2>
        <StandingList people={data.people} />
      </section>
    </>
  );
}
