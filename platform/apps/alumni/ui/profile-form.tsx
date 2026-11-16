"use client";
import { useState, type FormEvent } from "react";
import type { Choice, Lists, StudentProfile } from "../data/reads";
import { request } from "./client";
import { LoadError, useLoad } from "./use-load";

interface Draft {
  graduationYear: string;
  major: string;
  secondMajor: string;
  careerGoal: string;
  linkedinUrl: string;
  skillIds: string[];
  industryIds: string[];
  locationIds: string[];
  helpKindIds: string[];
}

function draftOf(profile: StudentProfile | null): Draft {
  return {
    graduationYear: profile ? String(profile.graduationYear) : "",
    major: profile?.majorIds[0] ?? "",
    secondMajor: profile?.majorIds[1] ?? "",
    careerGoal: profile?.careerGoal ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    skillIds: profile?.skillIds ?? [],
    industryIds: profile?.industryIds ?? [],
    locationIds: profile?.locationIds ?? [],
    helpKindIds: profile?.helpKindIds ?? [],
  };
}

function ChoiceGroup({
  legend,
  note,
  choices,
  chosen,
  max,
  onChange,
}: {
  legend: string;
  note: string;
  choices: Choice[];
  chosen: string[];
  max: number;
  onChange(next: string[]): void;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <p className="field-note">{note}</p>
      <div className="alumni-choices">
        {choices.map((choice) => {
          const checked = chosen.includes(choice.id);
          return (
            <label key={choice.id} className="check-label">
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && chosen.length >= max}
                onChange={() =>
                  onChange(
                    checked ? chosen.filter((id) => id !== choice.id) : [...chosen, choice.id],
                  )
                }
              />
              {choice.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ProfileForm({
  profile,
  firstUse,
  onSaved,
}: {
  profile: StudentProfile | null;
  firstUse: boolean;
  onSaved(profile: StudentProfile): void;
}) {
  const lists = useLoad<Lists>("lists");
  const [draft, setDraft] = useState<Draft>(() => draftOf(profile));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  if (lists.loading) return <p role="status">Loading the profile form…</p>;
  if (lists.error || !lists.data)
    return <LoadError message={lists.error ?? "We couldn’t load the form."} retry={lists.reload} />;
  const choices = lists.data;
  const set = (change: Partial<Draft>) => {
    setSaved(false);
    setDraft({ ...draft, ...change });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const year = Number(draft.graduationYear);
    if (!draft.major || !Number.isInteger(year) || year < 1950 || year > 2100)
      return setError("Choose your major and enter the year you graduate.");
    if (!draft.industryIds.length || !draft.helpKindIds.length)
      return setError("Choose at least one industry and one kind of help.");
    setSaving(true);
    setError(null);
    const result = await request<{ profile: StudentProfile }>("me/profile", {
      method: "PUT",
      body: {
        graduationYear: year,
        majorIds: [draft.major, draft.secondMajor].filter(
          (id, index, all) => id && all.indexOf(id) === index,
        ),
        careerGoal: draft.careerGoal.trim() || null,
        linkedinUrl: draft.linkedinUrl.trim() || null,
        skillIds: draft.skillIds,
        industryIds: draft.industryIds,
        locationIds: draft.locationIds,
        helpKindIds: draft.helpKindIds,
      },
    });
    setSaving(false);
    if (!result.data) return setError(result.error ?? "We couldn’t save your profile. Try again.");
    setSaved(true);
    onSaved(result.data.profile);
  };
  return (
    <form className="form-stack alumni-card" onSubmit={(event) => void submit(event)} noValidate>
      {firstUse && (
        <p className="notice" role="status">
          Tell us about yourself first. It takes about two minutes, and your answers decide which
          alumni you are matched with. Only you and Slice admins can see them.
        </p>
      )}
      <fieldset>
        <legend>About you</legend>
        <div className="alumni-filters">
          <label>
            Major
            <select
              value={draft.major}
              required
              onChange={(event) => set({ major: event.target.value })}
            >
              <option value="">Choose a major</option>
              {choices.majors.map((major) => (
                <option key={major.id} value={major.id}>
                  {major.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Second major (optional)
            <select
              value={draft.secondMajor}
              onChange={(event) => set({ secondMajor: event.target.value })}
            >
              <option value="">None</option>
              {choices.majors.map((major) => (
                <option key={major.id} value={major.id}>
                  {major.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Graduation year
            <input
              type="number"
              inputMode="numeric"
              min={1950}
              max={2100}
              required
              value={draft.graduationYear}
              onChange={(event) => set({ graduationYear: event.target.value })}
            />
          </label>
        </div>
        <label>
          Career goal (optional)
          <input
            type="text"
            maxLength={300}
            value={draft.careerGoal}
            onChange={(event) => set({ careerGoal: event.target.value })}
          />
          <span className="field-note">One short sentence in your own words.</span>
        </label>
        <label>
          Your LinkedIn profile (optional)
          <input
            type="url"
            maxLength={300}
            placeholder="https://www.linkedin.com/in/your-name"
            value={draft.linkedinUrl}
            onChange={(event) => set({ linkedinUrl: event.target.value })}
          />
          <span className="field-note">
            Kept so your alumni profile is ready when you graduate.
          </span>
        </label>
      </fieldset>
      <ChoiceGroup
        legend="Industries you are interested in"
        note="Choose one to five."
        choices={choices.industries}
        chosen={draft.industryIds}
        max={5}
        onChange={(industryIds) => set({ industryIds })}
      />
      <ChoiceGroup
        legend="Help you want from alumni"
        note="Choose at least one."
        choices={choices.helpKinds}
        chosen={draft.helpKindIds}
        max={6}
        onChange={(helpKindIds) => set({ helpKindIds })}
      />
      <ChoiceGroup
        legend="What you are good at"
        note="Optional. Choose up to eight."
        choices={choices.skills}
        chosen={draft.skillIds}
        max={8}
        onChange={(skillIds) => set({ skillIds })}
      />
      <ChoiceGroup
        legend="Cities you would like to work in"
        note="Optional. These are the cities where alumni work now. Choose up to five."
        choices={choices.cities}
        chosen={draft.locationIds.filter((id) => choices.cities.some((city) => city.id === id))}
        max={5}
        onChange={(locationIds) => set({ locationIds })}
      />
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="notice" role="status">
          Your profile is saved. Changes affect your next matches, not earlier ones.
        </p>
      )}
      <button type="submit" className="primary-button" disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
