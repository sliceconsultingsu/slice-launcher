"use client";
import { useState } from "react";
import type { ProposalView } from "../refresh/review";
import { AdminHead } from "./admin-head";
import { formatDate, request } from "./client";
import { Icon } from "./icons";
import { Tile, profileHref } from "./people";
import { LoadError, useLoad } from "./use-load";

/**
 * The proposals waiting for an admin, each with Approve and Reject. `level` is the heading level
 * for each person's name, so the list fits under whatever heading the page gives it.
 */
export function ProposalList({ level, onReviewed }: { level: 2 | 3; onReviewed?: () => void }) {
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
    onReviewed?.();
  };
  const Name = level === 2 ? "h2" : "h3";
  return (
    <>
      {message && (
        <p
          className={`al-note ${message.failed ? "al-note-error" : "al-note-ok"}`}
          role={message.failed ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      {data.proposals.length === 0 ? (
        <p className="al-note">No proposed changes are waiting for review.</p>
      ) : (
        <ul className="al-stack">
          {data.proposals.map((proposal) => {
            const linkable = /^https:\/\//.test(proposal.source);
            return (
              <li key={proposal.id} className="al-card">
                <div className="al-person-row">
                  <Tile id={proposal.personId} name={proposal.name} size="md" />
                  <div>
                    <Name className="al-h3">
                      <a href={profileHref(proposal.personId)}>{proposal.name}</a>
                    </Name>
                    <span className="al-muted">
                      {proposal.change}. Read {formatDate(proposal.foundAt)} from{" "}
                      {linkable ? (
                        <a
                          href={proposal.source}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 400, textDecoration: "underline" }}
                        >
                          the source page<span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        proposal.source
                      )}
                      .
                    </span>
                  </div>
                </div>
                <div className="al-change">
                  <div>
                    <p className="al-eyebrow">On the profile now</p>
                    <p>{proposal.current ?? "Nothing recorded"}</p>
                  </div>
                  <div>
                    <p className="al-eyebrow">Proposed</p>
                    <p>
                      <strong>{proposal.proposed}</strong>
                    </p>
                  </div>
                </div>
                <div className="al-actions">
                  <button
                    type="button"
                    className="al-btn al-btn-dark"
                    disabled={busy !== null}
                    onClick={() => void review(proposal, "approved")}
                  >
                    <Icon name="check" />
                    Approve<span className="sr-only"> the change for {proposal.name}</span>
                  </button>
                  <button
                    type="button"
                    className="al-btn"
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

export function ReviewView() {
  return (
    <>
      <AdminHead
        title="Review proposed changes"
        lead="The alumni refresh files these suggestions. Nothing changes a profile until you approve it."
      />
      <ProposalList level={2} />
    </>
  );
}
