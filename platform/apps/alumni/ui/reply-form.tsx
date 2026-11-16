"use client";
import { useState, type FormEvent } from "react";
import type { ReplyForm } from "../confirmation/reply";
import type { Lists } from "../data/reads";
import { APP, request } from "./client";
import { LoadError, useLoad } from "./use-load";

const KIND = { email: "Email", phone: "Phone", linkedin: "LinkedIn", other: "Other" } as const;
type Kind = keyof typeof KIND;
const kindLabel = (kind: string) => (kind in KIND ? KIND[kind as Kind] : "Other");

function Fields({ form, lists }: { form: ReplyForm; lists: Lists }) {
  const [employer, setEmployer] = useState(form.employer ?? "");
  const [title, setTitle] = useState(form.title ?? "");
  const [industryId, setIndustryId] = useState(form.industryId ?? "");
  const [shared, setShared] = useState(() =>
    Object.fromEntries(form.contacts.map((contact) => [contact.id, contact.shared])),
  );
  const [newKind, setNewKind] = useState<Kind>("email");
  const [newValue, setNewValue] = useState("");
  const [help, setHelp] = useState(form.helpKindIds);
  const [note, setNote] = useState(form.note ?? "");
  const [unlist, setUnlist] = useState(!form.listed);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const profile = `${APP}/alumni/${encodeURIComponent(form.personId)}`;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await request(`alumni/${encodeURIComponent(form.personId)}/reply`, {
      method: "POST",
      body: {
        employer: employer.trim() || null,
        title: title.trim() || null,
        industryId: employer.trim() || title.trim() ? industryId || null : null,
        contacts: form.contacts.map((contact) => ({
          id: contact.id,
          share: Boolean(shared[contact.id]),
        })),
        newContacts: newValue.trim() ? [{ kind: newKind, value: newValue.trim() }] : [],
        helpKindIds: help,
        note: note.trim() || null,
        listed: !unlist,
      },
    });
    setSaving(false);
    if (result.ok) setSaved(true);
    else setError(result.error);
  };
  if (saved)
    return (
      <p className="notice" role="status">
        Saved. {form.name}’s profile is updated and marked as confirmed today.{" "}
        <a href={profile}>See the profile</a> or <a href={`${APP}/confirm`}>go back to the list</a>.
      </p>
    );
  return (
    <form className="form-stack alumni-card" onSubmit={(event) => void submit(event)} noValidate>
      <p className="alumni-muted">
        Enter what {form.name} told you in their reply. Leave anything they did not mention as it
        is.
      </p>
      <fieldset>
        <legend>Current job</legend>
        <div className="alumni-filters">
          <label>
            Company
            <input
              type="text"
              maxLength={120}
              value={employer}
              onChange={(e) => setEmployer(e.target.value)}
            />
          </label>
          <label>
            Role
            <input
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Industry
            <select value={industryId} onChange={(e) => setIndustryId(e.target.value)}>
              <option value="">Choose an industry</option>
              {lists.industries.map((industry) => (
                <option key={industry.id} value={industry.id}>
                  {industry.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Contact details they are happy to share</legend>
        <p className="field-note">
          Ticked details are shown to Slice members. Unticked ones are hidden.
        </p>
        {form.contacts.length === 0 && (
          <p className="alumni-muted">No contact details are on file.</p>
        )}
        <div className="alumni-choices">
          {form.contacts.map((contact) => (
            <label key={contact.id} className="check-label">
              <input
                type="checkbox"
                checked={Boolean(shared[contact.id])}
                onChange={(e) => setShared({ ...shared, [contact.id]: e.target.checked })}
              />
              {kindLabel(contact.kind)}: {contact.value}
            </label>
          ))}
        </div>
        <div className="alumni-filters">
          <label>
            Add a detail they gave
            <select
              value={newKind}
              onChange={(e) =>
                setNewKind(e.target.value in KIND ? (e.target.value as Kind) : "other")
              }
            >
              {Object.entries(KIND).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            The new detail
            <input
              type="text"
              maxLength={300}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>What they can help with</legend>
        <div className="alumni-choices">
          {lists.helpKinds.map((kind) => (
            <label key={kind.id} className="check-label">
              <input
                type="checkbox"
                checked={help.includes(kind.id)}
                onChange={() =>
                  setHelp(
                    help.includes(kind.id)
                      ? help.filter((id) => id !== kind.id)
                      : [...help, kind.id],
                  )
                }
              />
              {kind.name}
            </label>
          ))}
        </div>
        <label>
          Note shown on their profile (optional)
          <input
            type="text"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </fieldset>
      <label className="check-label">
        <input type="checkbox" checked={unlist} onChange={(e) => setUnlist(e.target.checked)} />
        They asked not to be listed. Hide them from members.
      </label>
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
      <div className="alumni-actions">
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? "Saving…" : "Save their reply"}
        </button>
        <a className="secondary-button" href={profile}>
          Cancel
        </a>
      </div>
    </form>
  );
}

export function ReplyFormView({ id }: { id: string }) {
  const form = useLoad<{ form: ReplyForm }>(`alumni/${encodeURIComponent(id)}/reply`);
  const lists = useLoad<Lists>("lists");
  if (form.loading || lists.loading) return <p role="status">Loading their details…</p>;
  if (form.error || !form.data)
    return <LoadError message={form.error ?? "We couldn’t load this alum."} retry={form.reload} />;
  if (lists.error || !lists.data)
    return (
      <LoadError message={lists.error ?? "We couldn’t load the choices."} retry={lists.reload} />
    );
  return <Fields form={form.data.form} lists={lists.data} />;
}
