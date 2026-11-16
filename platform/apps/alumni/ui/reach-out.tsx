"use client";
import { useEffect, useRef, useState } from "react";
import type { AlumProfile, AlumSummary } from "../data/reads";
import { firstMessage } from "../matching/opener";
import { Icon } from "./icons";
import { Tile, firstNameOf, httpsAddress, profileHref } from "./people";
import { useLoad } from "./use-load";

const SUBJECT = "A Slice Consulting student hoping to connect";

/**
 * The panel that opens after Reach out: a first message to edit, and the ways to send it.
 * The app sends nothing itself. The student opens their own email or LinkedIn.
 */
export function ReachOutDialog({
  alum,
  reasons,
  studentName,
  nextName,
  onUndo,
  onClose,
}: {
  alum: AlumSummary;
  reasons: string[];
  studentName: string;
  /** The next alum waiting in the deck, or null when this was the last. */
  nextName: string | null;
  /** Takes back "reached out". Resolves true when it was saved. */
  onUndo(): Promise<boolean>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const profile = useLoad<{ alum: AlumProfile }>(`alumni/${encodeURIComponent(alum.id)}`);
  const [message, setMessage] = useState(() =>
    firstMessage({ studentName, alumName: alum.name, reasons }),
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const panel = dialog.current;
    if (panel && !panel.open) panel.showModal();
  }, []);
  const close = () => dialog.current?.close();
  const first = firstNameOf(alum.name) || "them";
  const contacts = profile.data?.alum.contacts ?? [];
  const email = contacts.find((contact) => contact.kind === "email")?.value ?? null;
  const linkedin = contacts
    .filter((contact) => contact.kind === "linkedin")
    .map((contact) => httpsAddress(contact.value))
    .find((address) => address !== null);
  const copy = () =>
    void navigator.clipboard.writeText(message).then(
      () => setCopied(true),
      () => setCopied(false),
    );

  return (
    <dialog ref={dialog} className="al-dialog" aria-labelledby="reach-title" onClose={onClose}>
      <div>
        <div className="al-dialog-head">
          <Tile id={alum.id} name={alum.name} size="lg" />
          <div>
            <h2 id="reach-title" className="al-h2">
              Say hello to {first}
            </h2>
            {alum.title && alum.employer && (
              <p className="al-muted">
                {alum.title} at {alum.employer}
              </p>
            )}
          </div>
          <button type="button" className="al-close" aria-label="Close" onClick={close}>
            <Icon name="cross" />
          </button>
        </div>

        <label className="al-field">
          A first message you can edit
          <textarea
            value={message}
            rows={6}
            maxLength={1500}
            onChange={(event) => {
              setMessage(event.target.value);
              setCopied(false);
            }}
          />
          <span>
            Written from what the two of you have in common. Nothing is sent until you send it
            yourself.
          </span>
        </label>

        <div className="al-actions">
          {email && (
            <a
              className="al-btn al-btn-go"
              href={`mailto:${email}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(message)}`}
            >
              <Icon name="mail" size={22} />
              Open in my email
            </a>
          )}
          {linkedin && (
            <a className="al-btn" href={linkedin} target="_blank" rel="noreferrer">
              Message on LinkedIn
              <Icon name="out" size={16} />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <button type="button" className="al-btn" onClick={copy}>
            {copied ? "Copied" : "Copy the message"}
          </button>
        </div>
        {profile.loading ? (
          <p role="status">Loading how to reach {first}…</p>
        ) : (
          !email &&
          !linkedin && (
            <p className="al-note" role="status">
              {first} has no email or LinkedIn page to share yet.{" "}
              <a href={profileHref(alum.id)}>See their profile</a>
            </p>
          )
        )}

        <div className="al-note al-note-ok al-actions" role="status">
          <Icon name="check" />
          <strong style={{ flex: "1 1 200px" }}>Marked as reached out.</strong>
          <button
            type="button"
            className="al-text-btn"
            onClick={() => void onUndo().then((undone) => undone && close())}
          >
            Undo
          </button>
        </div>

        <div className="al-dialog-foot">
          <p className="al-muted">
            {nextName ? "There is another match waiting." : "That was the last one in this set."}
          </p>
          <button type="button" className="al-btn al-btn-dark" onClick={close}>
            {nextName ? `Next: ${nextName}` : "Done"}
            {nextName && <Icon name="arrow" />}
          </button>
        </div>
      </div>
    </dialog>
  );
}
