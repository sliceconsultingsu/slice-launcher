"use client";
import { useState } from "react";
import type { ConfirmationMessage } from "../confirmation/message";
import type { ConfirmationPerson, SendResult } from "../confirmation/send";
import { APP, formatDate, request } from "./client";
import { LoadError, useLoad } from "./use-load";

interface Status {
  ready: boolean;
  people: ConfirmationPerson[];
  example: ConfirmationMessage;
}

function standing(person: ConfirmationPerson): { text: string; badge: string } {
  if (person.answeredAt && (!person.askedAt || person.answeredAt >= person.askedAt))
    return { text: `Answered ${formatDate(person.answeredAt)}`, badge: "status-active" };
  if (person.askedAt)
    return { text: `Asked ${formatDate(person.askedAt)}`, badge: "status-pending" };
  if (person.failedAt)
    return { text: `Email refused ${formatDate(person.failedAt)}`, badge: "status-suspended" };
  if (!person.hasEmail) return { text: "No email on file", badge: "" };
  return { text: "Not asked yet", badge: "" };
}

export function ConfirmView() {
  const { data, error, loading, reload } = useLoad<Status>("confirmations");
  const [asking, setAsking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; failed: boolean } | null>(null);
  if (loading) return <p role="status">Loading who can be asked…</p>;
  if (error || !data)
    return <LoadError message={error ?? "We couldn’t load this page."} retry={reload} />;
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
      <p className="alumni-muted">
        The app emails each listed alum once, asking them to confirm their job and say which contact
        details they are happy to share. Their reply comes to your own email. Record it from their
        profile and the directory is updated.
      </p>
      {!data.ready && (
        <p className="notice" role="status">
          Email is not set up yet, so nothing can be sent. The Slice maintainer switches it on.
        </p>
      )}
      {outcome && (
        <p
          className={`notice${outcome.failed ? " error-notice" : ""}`}
          role={outcome.failed ? "alert" : "status"}
        >
          {outcome.text}
        </p>
      )}
      {progress && <p role="status">{progress}</p>}
      <div className="alumni-card">
        <h2>
          {due} {due === 1 ? "alum" : "alumni"} can be asked now
        </h2>
        <p className="alumni-muted">
          {noEmail > 0 &&
            `${noEmail} ${noEmail === 1 ? "has" : "have"} no email on file and cannot be asked this way. `}
          Nobody is emailed twice within a year.
        </p>
        <details>
          <summary>Read the email before sending</summary>
          <p className="alumni-small">
            Shown with an invented alum. Each person sees their own job.
          </p>
          <p>
            <strong>{data.example.subject}</strong>
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{data.example.text}</p>
        </details>
        <div className="alumni-actions">
          {asking ? (
            <>
              <button type="button" className="primary-button" onClick={() => void send()}>
                Yes, send {due} {due === 1 ? "email" : "emails"}
              </button>
              <button type="button" className="secondary-button" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={!data.ready || due === 0 || progress !== null}
              onClick={() => setAsking(true)}
            >
              Send confirmation emails
            </button>
          )}
        </div>
        {asking && (
          <p className="alumni-small" role="status">
            These are real emails to real people and cannot be taken back.
          </p>
        )}
      </div>
      <section aria-labelledby="confirm-people">
        <div className="alumni-toolbar">
          <h2 id="confirm-people">Where each alum stands</h2>
        </div>
        {data.people.length === 0 ? (
          <p>No alumni are listed yet.</p>
        ) : (
          <ul className="alumni-grid">
            {data.people.map((person) => {
              const { text, badge } = standing(person);
              return (
                <li key={person.personId} className="alumni-card">
                  <h3>
                    <a href={`${APP}/alumni/${encodeURIComponent(person.personId)}`}>
                      {person.fullName}
                    </a>
                  </h3>
                  <p>
                    <span className={`status-badge ${badge}`}>{text}</span>
                  </p>
                  <p>
                    <a href={`${APP}/alumni/${encodeURIComponent(person.personId)}/reply`}>
                      Record their reply<span className="sr-only"> for {person.fullName}</span>
                    </a>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
