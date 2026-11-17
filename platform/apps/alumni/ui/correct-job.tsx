"use client";
import { useState, type FormEvent } from "react";
import type { AlumProfile, Lists } from "../data/reads";
import { request } from "./client";
import { LoadError, useLoad } from "./use-load";

/**
 * An admin's form for fixing a mistake in an alum's current job: the company, the role or the
 * industry. It is not for a new job; the note under the heading says so and points to replies.
 */
export function CorrectJob({
  alum,
  first,
  onClose,
  onSaved,
}: {
  alum: AlumProfile;
  first: string;
  onClose(): void;
  onSaved(): void;
}) {
  const lists = useLoad<Lists>("lists");
  const [employer, setEmployer] = useState(alum.employer ?? "");
  const [title, setTitle] = useState(alum.title ?? "");
  // Until the admin picks one, the industry shown is the one on the profile.
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const industries = lists.data?.industries ?? [];
  const industryId =
    picked ?? industries.find((industry) => industry.name === alum.industry)?.id ?? "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!employer.trim() || !title.trim() || !industryId) {
      setError("Fill in the company, the role and the industry.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await request(`alumni/${encodeURIComponent(alum.id)}/job`, {
      method: "POST",
      body: { employer: employer.trim(), title: title.trim(), industryId },
    });
    setSaving(false);
    if (result.ok) onSaved();
    else setError(result.error);
  };

  if (lists.error)
    return <LoadError message="We couldn’t load the industries." retry={lists.reload} />;
  return (
    <form
      className="al-form"
      aria-labelledby="correct-job"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <h3 id="correct-job" className="al-h3">
        Correct job details
      </h3>
      <p className="al-field-note">
        For a mistake in the record. Nothing moves to past jobs and the date the details were last
        checked stays the same. If {first} has changed jobs, record their reply instead.
      </p>
      <div className="al-fields">
        <label className="al-field">
          Company
          <input
            type="text"
            maxLength={120}
            value={employer}
            onChange={(e) => setEmployer(e.target.value)}
          />
        </label>
        <label className="al-field">
          Role
          <input
            type="text"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="al-field">
          Industry
          <select
            value={industryId}
            disabled={lists.loading}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">Choose an industry</option>
            {industries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="al-note al-note-error" role="alert">
          {error}
        </p>
      )}
      <div className="al-actions">
        <button type="submit" className="al-btn al-btn-dark" disabled={saving || lists.loading}>
          {saving ? "Saving…" : "Save the correction"}
        </button>
        <button type="button" className="al-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
