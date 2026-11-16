"use client";
import { useState } from "react";
import type { ProposalView } from "../refresh/review";
import { APP, formatDate, request } from "./client";
import { LoadError, useLoad } from "./use-load";

export function ReviewView() {
  const { data, error, loading, reload } = useLoad<{ proposals: ProposalView[] }>("proposals");
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (loading) return <p role="status">Loading proposed changes…</p>;
  if (error || !data)
    return <LoadError message={error ?? "We couldn’t load the proposed changes."} retry={reload} />;
  const review = async (proposal: ProposalView, decision: "approved" | "rejected") => {
    setBusy(proposal.id);
    setMessage(null);
    const result = await request(`proposals/${encodeURIComponent(proposal.id)}/review`, {
      method: "POST",
      body: { decision },
    });
    setBusy(null);
    setMessage(
      result.ok
        ? {
            text:
              decision === "approved"
                ? `Approved. ${proposal.name}’s profile is updated.`
                : `Rejected. ${proposal.name}’s profile is unchanged.`,
            failed: false,
          }
        : {
            text: `${result.error ?? "That did not work."} The list has been reloaded.`,
            failed: true,
          },
    );
    reload();
  };
  return (
    <>
      <p className="alumni-muted">
        The alumni refresh files these suggestions. Nothing changes a profile until you approve it.
      </p>
      {message && (
        <p
          className={`notice${message.failed ? " error-notice" : ""}`}
          role={message.failed ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      {data.proposals.length === 0 ? (
        <p>No proposed changes are waiting for review.</p>
      ) : (
        <ul className="alumni-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          {data.proposals.map((proposal) => {
            const linkable = /^https:\/\//.test(proposal.source);
            return (
              <li key={proposal.id} className="alumni-card">
                <h2>
                  <a href={`${APP}/alumni/${encodeURIComponent(proposal.personId)}`}>
                    {proposal.name}
                  </a>
                </h2>
                <p className="alumni-muted">{proposal.change}</p>
                <div className="alumni-change">
                  <div>
                    <p className="alumni-small">On the profile now</p>
                    <p>{proposal.current ?? "Nothing recorded"}</p>
                  </div>
                  <div>
                    <p className="alumni-small">Proposed</p>
                    <p>{proposal.proposed}</p>
                  </div>
                </div>
                <p className="alumni-small">
                  Read {formatDate(proposal.foundAt)} from{" "}
                  {linkable ? (
                    <a href={proposal.source} target="_blank" rel="noreferrer">
                      the source page<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    proposal.source
                  )}
                </p>
                <div className="alumni-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy !== null}
                    onClick={() => void review(proposal, "approved")}
                  >
                    Approve<span className="sr-only"> the change for {proposal.name}</span>
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy !== null}
                    onClick={() => void review(proposal, "rejected")}
                  >
                    Reject<span className="sr-only"> the change for {proposal.name}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
