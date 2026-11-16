"use client";
import { useState } from "react";
import type { AlumProfile, ContactDetail, MatchOutcome, SearchPage } from "../data/reads";
import type { MyMatches } from "../matching/mine";
import { APP, formatDate, formatMonth, request } from "./client";
import { Icon } from "./icons";
import { matchWith, saveOutcome } from "./mine";
import { Face, PersonChip, firstNameOf, httpsAddress } from "./people";
import { LoadError, useLoad } from "./use-load";

const KIND = { email: "Email", phone: "Phone", linkedin: "LinkedIn", other: "Other" } as const;

/** A contact detail as a link where that is safe, otherwise as plain text. */
function ContactValue({ contact }: { contact: ContactDetail }) {
  if (contact.kind === "email") return <a href={`mailto:${contact.value}`}>{contact.value}</a>;
  if (contact.kind === "phone")
    return <a href={`tel:${contact.value.replace(/[^0-9+]/g, "")}`}>{contact.value}</a>;
  const address = httpsAddress(contact.value);
  if (!address) return <span>{contact.value}</span>;
  return (
    <a href={address} target="_blank" rel="noreferrer">
      {contact.kind === "linkedin" ? "LinkedIn profile" : contact.value}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Other listed alumni whose current job is at the same employer. */
function Colleagues({ employer, selfId }: { employer: string; selfId: string }) {
  const { data } = useLoad<SearchPage>(`alumni?q=${encodeURIComponent(employer)}&limit=20`);
  const others = (data?.results ?? []).filter(
    (alum) => alum.employer === employer && alum.id !== selfId,
  );
  if (!others.length) return null;
  return (
    <>
      <h3 className="al-eyebrow">Also at {employer}</h3>
      <ul className="al-actions">
        {others.map((alum) => (
          <li key={alum.id}>
            <PersonChip id={alum.id} name={alum.name} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function AlumView({
  id,
  admin,
  mine,
  onMine,
}: {
  id: string;
  admin: boolean;
  mine: MyMatches | null;
  onMine(next: MyMatches): void;
}) {
  const { data, error, loading, reload } = useLoad<{ alum: AlumProfile }>(
    `alumni/${encodeURIComponent(id)}`,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const back = (
    <a className="al-text-btn" href={`${APP}/explore`}>
      <Icon name="back" />
      Back to the network
    </a>
  );
  if (loading) return <p role="status">Loading profile…</p>;
  if (error || !data)
    return (
      <>
        <h1 className="al-h1">Profile not found</h1>
        <LoadError message={error ?? "We couldn’t load this profile."} retry={reload} />
        <p>{back}</p>
      </>
    );
  const alum = data.alum;
  const first = firstNameOf(alum.name) || "this alum";
  const match = matchWith(mine, alum.id);
  const change = async (path: string, body: unknown) => {
    setSaving(true);
    setMessage(null);
    const result = await request(path, { method: "POST", body });
    setSaving(false);
    if (result.ok) reload();
    else setMessage(result.error);
  };
  const decide = async (outcome: MatchOutcome) => {
    if (!mine || !match) return;
    setSaving(true);
    setMessage(null);
    const result = await saveOutcome(mine, match, match.outcome === outcome ? null : outcome);
    setSaving(false);
    if (result.mine) onMine(result.mine);
    else setMessage(result.error);
  };
  const email = alum.contacts.find((contact) => contact.kind === "email" && !contact.hidden);
  const linkedin = alum.contacts
    .filter((contact) => contact.kind === "linkedin" && !contact.hidden)
    .map((contact) => httpsAddress(contact.value))
    .find((address) => address !== null);
  const checked = formatDate(alum.lastCheckedAt);
  const studied = [alum.majors.join(" and "), `Class of ${alum.graduationYear}`]
    .filter(Boolean)
    .join(", ");
  return (
    <article className="al-stack" aria-labelledby="alum-name">
      <p>{back}</p>
      {message && (
        <p className="al-note al-note-error" role="alert">
          {message}
        </p>
      )}
      <div className="al-profile">
        <Face id={alum.id} name={alum.name} />
        <div className="al-profile-text">
          {alum.hidden ? (
            <span className="al-badge">Hidden from members</span>
          ) : (
            match && <span className="al-badge al-badge-warm">Your match</span>
          )}
          <h1 id="alum-name" className="al-h1">
            {alum.name}
          </h1>
          <p className="al-lead">
            {alum.title && alum.employer
              ? `${alum.title} at ${alum.employer}`
              : "No current job on record."}
          </p>
          <p className="al-muted">
            {alum.city && `${alum.city}. `}Class of {alum.graduationYear}.
            {alum.industry && ` ${alum.industry}.`}
          </p>
          {(email || linkedin) && (
            <div className="al-actions">
              {email && (
                <a className="al-btn al-btn-dark" href={`mailto:${email.value}`}>
                  <Icon name="mail" size={20} />
                  Email {first}
                </a>
              )}
              {linkedin && (
                <a className="al-btn" href={linkedin} target="_blank" rel="noreferrer">
                  LinkedIn page
                  <Icon name="out" size={16} />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          )}
          {match && (
            <div className="al-actions">
              <button
                type="button"
                className="al-text-btn"
                aria-pressed={match.outcome === "contacted"}
                disabled={saving}
                onClick={() => void decide("contacted")}
              >
                {match.outcome === "contacted" && <Icon name="check" />}I reached out
              </button>
              <button
                type="button"
                className="al-text-btn"
                aria-pressed={match.outcome === "not-for-me"}
                disabled={saving}
                onClick={() => void decide("not-for-me")}
              >
                {match.outcome === "not-for-me" && <Icon name="check" />}Not for me
              </button>
            </div>
          )}
          <p className="al-small">
            {checked
              ? `Details last checked ${checked}.`
              : "This profile has not been checked yet."}
          </p>
        </div>
      </div>

      <div className="al-split">
        <div className="al-stack al-main">
          {match && (
            <section className="al-card al-card-warm" aria-labelledby="why">
              <h2 id="why" className="al-h2">
                Why the two of you
              </h2>
              <ol className="al-numbered">
                {match.reasons.map((reason, index) => (
                  <li key={reason}>
                    <span aria-hidden="true">{index + 1}</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="al-card" aria-labelledby="help">
            <h2 id="help" className="al-h2">
              Happy to help with
            </h2>
            {alum.helpOffered.length ? (
              <ul className="al-chips">
                {alum.helpOffered.map((kind) => (
                  <li key={kind}>{kind}</li>
                ))}
              </ul>
            ) : (
              <p>{first} has not said what they can help with.</p>
            )}
            {alum.note && <p>{alum.note}</p>}
          </section>
          <section className="al-card" aria-labelledby="reach">
            <h2 id="reach" className="al-h2">
              How to reach {first}
            </h2>
            {alum.contacts.length ? (
              <ul className="al-facts" aria-label="Contact details">
                {alum.contacts.map((contact) => (
                  <li key={`${contact.kind}-${contact.value}`}>
                    <span>{contact.label ?? KIND[contact.kind]}</span>
                    <strong>
                      <ContactValue contact={contact} />
                    </strong>
                    {contact.hidden && <span className="al-badge">Hidden</span>}
                    {admin && contact.id && (
                      <button
                        type="button"
                        className="al-text-btn"
                        disabled={saving}
                        onClick={() =>
                          void change(
                            `contacts/${encodeURIComponent(contact.id ?? "")}/visibility`,
                            { visibility: contact.hidden ? "members" : "hidden" },
                          )
                        }
                      >
                        {contact.hidden ? "Show to members" : "Hide from members"}
                        <span className="sr-only">
                          {" "}
                          {KIND[contact.kind]} {contact.value}
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>This alum has no contact details to share yet.</p>
            )}
            <p className="al-small">Only signed-in Slice members can see this.</p>
          </section>
          {admin && (
            <section className="al-card" aria-labelledby="admin-tools">
              <h2 id="admin-tools" className="al-h3">
                For admins
              </h2>
              <div className="al-actions">
                <button
                  type="button"
                  className="al-btn"
                  disabled={saving}
                  onClick={() =>
                    void change(`alumni/${encodeURIComponent(alum.id)}/listing`, {
                      status: alum.hidden ? "listed" : "hidden",
                    })
                  }
                >
                  {alum.hidden ? "List this alum again" : "Hide this alum from members"}
                </button>
                <a className="al-btn" href={`${APP}/alumni/${encodeURIComponent(alum.id)}/reply`}>
                  Record a reply from them
                </a>
              </div>
            </section>
          )}
        </div>

        <section className="al-card al-side" aria-labelledby="path">
          <h2 id="path" className="al-h2">
            The path so far
          </h2>
          <ol className="al-path">
            {alum.title && alum.employer && (
              <li className="al-path-now">
                <div>
                  <span className="al-badge al-badge-match">Now</span>
                  <span className="al-h3">{alum.title}</span>
                  <span>
                    {alum.employer}
                    {alum.city && `, ${alum.city}`}
                  </span>
                  {alum.jobStartMonth && (
                    <span className="al-small">Since {formatMonth(alum.jobStartMonth)}</span>
                  )}
                </div>
              </li>
            )}
            {alum.pastJobs.map((job) => (
              <li key={`${job.employer}-${job.title}-${job.endMonth}`}>
                <div>
                  <span className="al-h3">{job.title}</span>
                  <span>
                    {job.employer}
                    {job.city && `, ${job.city}`}
                  </span>
                  <span className="al-small">
                    {formatMonth(job.startMonth) ?? "Start not known"} to{" "}
                    {formatMonth(job.endMonth)}
                  </span>
                </div>
              </li>
            ))}
            <li className="al-path-start">
              <div>
                <span className="al-h3">Slice Consulting</span>
                <span>Syracuse University{studied && `, ${studied}`}</span>
                {(alum.minors.length > 0 || alum.schools.length > 0) && (
                  <span className="al-small">
                    {[...alum.schools, ...alum.minors.map((minor) => `Minor: ${minor}`)].join(". ")}
                  </span>
                )}
              </div>
            </li>
          </ol>
          {alum.employer && <Colleagues employer={alum.employer} selfId={alum.id} />}
        </section>
      </div>
    </article>
  );
}
