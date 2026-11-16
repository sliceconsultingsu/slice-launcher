"use client";
import { useState } from "react";
import type { AlumProfile, ContactDetail } from "../data/reads";
import { APP, formatDate, formatMonth, request } from "./client";
import { LoadError, useLoad } from "./use-load";

const KIND = { email: "Email", phone: "Phone", linkedin: "LinkedIn", other: "Other" } as const;

/** The value as a secure web address, or null when it is not one. */
function httpsAddress(value: string): string | null {
  const address = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(address).protocol === "https:" ? address : null;
  } catch {
    return null;
  }
}

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

export function AlumView({ id, admin }: { id: string; admin: boolean }) {
  const { data, error, loading, reload } = useLoad<{ alum: AlumProfile }>(
    `alumni/${encodeURIComponent(id)}`,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (loading) return <p role="status">Loading profile…</p>;
  if (error || !data)
    return (
      <>
        <LoadError message={error ?? "We couldn’t load this profile."} retry={reload} />
        <p>
          <a href={`${APP}/explore`}>Back to alumni</a>
        </p>
      </>
    );
  const alum = data.alum;
  const change = async (path: string, body: unknown) => {
    setSaving(true);
    setMessage(null);
    const result = await request(path, { method: "POST", body });
    setSaving(false);
    if (result.ok) reload();
    else setMessage(result.error);
  };
  const checked = formatDate(alum.lastCheckedAt);
  return (
    <article aria-labelledby="alum-name">
      <p>
        <a href={`${APP}/explore`}>Back to alumni</a>
      </p>
      <div className="alumni-toolbar">
        <h2 id="alum-name">{alum.name}</h2>
        {alum.hidden && <span className="status-badge status-suspended">Hidden from members</span>}
      </div>
      {message && (
        <p className="notice error-notice" role="alert">
          {message}
        </p>
      )}
      <div className="alumni-detail">
        <div className="alumni-card">
          <dl>
            <div>
              <dt>Current job</dt>
              <dd>
                {alum.title && alum.employer ? (
                  <>
                    {alum.title} · {alum.employer}
                    {alum.industry && ` · ${alum.industry}`}
                    {alum.city && ` · ${alum.city}`}
                    {alum.jobStartMonth && ` · since ${formatMonth(alum.jobStartMonth)}`}
                  </>
                ) : (
                  "No current job on record."
                )}
              </dd>
            </div>
            <div>
              <dt>Education</dt>
              <dd>
                Class of {alum.graduationYear}
                {alum.majors.length > 0 && ` · ${alum.majors.join(", ")}`}
                {alum.minors.length > 0 && ` · Minor: ${alum.minors.join(", ")}`}
              </dd>
              {alum.schools.length > 0 && (
                <dd className="alumni-muted">{alum.schools.join(" · ")}</dd>
              )}
            </div>
            <div>
              <dt>Past jobs</dt>
              {alum.pastJobs.length ? (
                <dd>
                  <ul>
                    {alum.pastJobs.map((job) => (
                      <li key={`${job.employer}-${job.title}-${job.endMonth}`}>
                        {job.title} · {job.employer} · {job.industry}
                        {job.city && ` · ${job.city}`} (
                        {formatMonth(job.startMonth) ?? "start not known"} to{" "}
                        {formatMonth(job.endMonth)})
                      </li>
                    ))}
                  </ul>
                </dd>
              ) : (
                <dd>No past jobs on record.</dd>
              )}
            </div>
            <div>
              <dt>Can help with</dt>
              {alum.helpOffered.length ? (
                <dd>{alum.helpOffered.join(", ")}</dd>
              ) : (
                <dd>This alum has not said what they can help with.</dd>
              )}
            </div>
            {alum.note && (
              <div>
                <dt>Note</dt>
                <dd>{alum.note}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="alumni-card">
          <h3>Contact details</h3>
          {alum.contacts.length ? (
            <ul aria-label="Contact details" style={{ listStyle: "none", paddingLeft: 0 }}>
              {alum.contacts.map((contact) => (
                <li key={`${contact.kind}-${contact.value}`} className="alumni-contact">
                  <span className="alumni-muted">{contact.label ?? KIND[contact.kind]}</span>
                  <ContactValue contact={contact} />
                  {contact.hidden && <span className="status-badge status-suspended">Hidden</span>}
                  {admin && contact.id && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={saving}
                      onClick={() =>
                        void change(`contacts/${encodeURIComponent(contact.id ?? "")}/visibility`, {
                          visibility: contact.hidden ? "members" : "hidden",
                        })
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
          <p className="alumni-small" style={{ marginTop: 16 }}>
            {checked
              ? `Profile last checked ${checked}.`
              : "This profile has not been checked yet."}
          </p>
          {admin && (
            <div className="alumni-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() =>
                  void change(`alumni/${encodeURIComponent(alum.id)}/listing`, {
                    status: alum.hidden ? "listed" : "hidden",
                  })
                }
              >
                {alum.hidden ? "List this alum again" : "Hide this alum from members"}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
