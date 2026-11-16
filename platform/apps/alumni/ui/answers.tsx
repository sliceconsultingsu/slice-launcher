"use client";
import { useState, type FormEvent } from "react";
import type { Choice, Lists, StudentProfile } from "../data/reads";
import { request } from "./client";
import { Icon } from "./icons";
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

/** The three steps a new student goes through, each with its own question. */
const STEPS = [
  { label: "About you", title: "First, a little about you" },
  { label: "What you are after", title: "Which industries are you curious about?" },
  { label: "Help you want", title: "What would you like help with?" },
] as const;

/** What is still missing on a step, in words, or null when the student can move on. */
function missing(step: number, draft: Draft): string | null {
  const year = Number(draft.graduationYear);
  if (step === 0 && (!draft.major || !Number.isInteger(year) || year < 1950 || year > 2100))
    return "Choose your major and enter the year you graduate.";
  if (step === 1 && !draft.industryIds.length) return "Choose at least one industry.";
  if (step === 2 && !draft.helpKindIds.length) return "Choose at least one kind of help.";
  return null;
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
  // A list with nothing on it yet, such as cities before any alum has one, is left out.
  if (!choices.length) return null;
  return (
    <fieldset className="al-group">
      <legend className="al-legend">{legend}</legend>
      <p className="al-field-note">
        {note} {chosen.length} of {max} chosen.
      </p>
      <div className="al-options">
        {choices.map((choice) => {
          const checked = chosen.includes(choice.id);
          return (
            <label key={choice.id} className="al-option">
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

function Benefits() {
  return (
    <aside className="al-card al-card-dark al-side" aria-labelledby="benefits">
      <h2 id="benefits" className="al-h2">
        What you get for this
      </h2>
      <ul className="al-benefits">
        <li>
          <span aria-hidden="true" className="al-tile al-tile-sm al-c1">
            3
          </span>
          <span>
            <strong>Three alumni every 30 days</strong>
            <span className="al-small">Each with the reason they were picked for you.</span>
          </span>
        </li>
        <li>
          <span aria-hidden="true" className="al-tile al-tile-sm al-c2">
            1
          </span>
          <span>
            <strong>Never the same person twice</strong>
            <span className="al-small">Earlier matches stay on your Matches page.</span>
          </span>
        </li>
        <li>
          <span aria-hidden="true" className="al-tile al-tile-sm al-c0">
            <Icon name="check" size={20} />
          </span>
          <span>
            <strong>Your answers stay private</strong>
            <span className="al-small">Only you and Slice admins can see them.</span>
          </span>
        </li>
      </ul>
      <p className="al-small">You can change any answer later from the tile with your initials.</p>
    </aside>
  );
}

export function AnswersView({
  profile,
  firstUse,
  onSaved,
}: {
  profile: StudentProfile | null;
  /** A new student answers one step at a time. Later, every answer is on one page. */
  firstUse: boolean;
  onSaved(profile: StudentProfile): void;
}) {
  const lists = useLoad<Lists>("lists");
  const [draft, setDraft] = useState<Draft>(() => draftOf(profile));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const title = firstUse ? STEPS[step]?.title : "My answers";
  if (lists.loading)
    return (
      <>
        <h1 className="al-h1">{title}</h1>
        <p role="status">Loading the form…</p>
      </>
    );
  if (lists.error || !lists.data)
    return (
      <>
        <h1 className="al-h1">{title}</h1>
        <LoadError message={lists.error ?? "We couldn’t load the form."} retry={lists.reload} />
      </>
    );
  const choices = lists.data;
  const set = (change: Partial<Draft>) => {
    setSaved(false);
    setDraft({ ...draft, ...change });
  };
  const last = STEPS.length - 1;
  const shows = (index: number) => !firstUse || step === index;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    // A new student is checked one step at a time; later, every step is checked on save.
    const steps = firstUse ? [step] : STEPS.map((_, index) => index);
    const problem = steps.map((index) => missing(index, draft)).find((text) => text !== null);
    if (problem) return setError(problem);
    setError(null);
    if (firstUse && step < last) return setStep(step + 1);
    setSaving(true);
    const result = await request<{ profile: StudentProfile }>("me/profile", {
      method: "PUT",
      body: {
        graduationYear: Number(draft.graduationYear),
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
    if (!result.data) return setError(result.error ?? "We couldn’t save your answers. Try again.");
    setSaved(true);
    onSaved(result.data.profile);
  };

  return (
    <div className="al-split">
      <form className="al-form al-main" onSubmit={(event) => void submit(event)} noValidate>
        {firstUse && (
          <ol className="al-steps" aria-label="Progress">
            {STEPS.map((item, index) => (
              <li
                key={item.label}
                className={index < step ? "al-step-done" : undefined}
                aria-current={index === step ? "step" : undefined}
              >
                {item.label}
                {index < step && <span className="sr-only"> (done)</span>}
              </li>
            ))}
          </ol>
        )}
        <div className="al-stack" style={{ gap: 10 }}>
          <h1 className="al-h1">{title}</h1>
          <p className="al-lead">
            {firstUse
              ? "It takes about two minutes. Your answers decide which alumni you are matched with."
              : "Changes affect your next matches, not earlier ones. Only you and Slice admins can see these."}
          </p>
        </div>

        {shows(0) && (
          <fieldset className="al-group">
            <legend className={firstUse ? "sr-only" : "al-legend"}>About you</legend>
            <div className="al-fields">
              <label className="al-field">
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
              <label className="al-field">
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
              <label className="al-field">
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
            <label className="al-field">
              Career goal (optional)
              <input
                type="text"
                maxLength={300}
                value={draft.careerGoal}
                onChange={(event) => set({ careerGoal: event.target.value })}
              />
              <span>
                One short sentence in your own words. It is not used to pick your matches.
              </span>
            </label>
            <label className="al-field">
              Your LinkedIn profile (optional)
              <input
                type="url"
                maxLength={300}
                placeholder="https://www.linkedin.com/in/your-name"
                value={draft.linkedinUrl}
                onChange={(event) => set({ linkedinUrl: event.target.value })}
              />
              <span>Kept so your alumni profile is ready when you graduate.</span>
            </label>
          </fieldset>
        )}
        {shows(1) && (
          <>
            <ChoiceGroup
              legend="Industries you are interested in"
              note="Choose one to five. Your matches come from alumni who work in them."
              choices={choices.industries}
              chosen={draft.industryIds}
              max={5}
              onChange={(industryIds) => set({ industryIds })}
            />
            <ChoiceGroup
              legend="Cities you would like to work in"
              note="Optional. These are the cities where alumni work now."
              choices={choices.cities}
              chosen={draft.locationIds.filter((id) =>
                choices.cities.some((city) => city.id === id),
              )}
              max={5}
              onChange={(locationIds) => set({ locationIds })}
            />
          </>
        )}
        {shows(2) && (
          <>
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
              note="Optional."
              choices={choices.skills}
              chosen={draft.skillIds}
              max={8}
              onChange={(skillIds) => set({ skillIds })}
            />
          </>
        )}

        {error && (
          <p className="al-note al-note-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="al-note al-note-ok" role="status">
            Your answers are saved. Changes affect your next matches, not earlier ones.
          </p>
        )}
        <div className="al-actions">
          {firstUse && step > 0 && (
            <button
              type="button"
              className="al-btn"
              onClick={() => {
                setError(null);
                setStep(step - 1);
              }}
            >
              Back
            </button>
          )}
          <button type="submit" className="al-btn al-btn-go" disabled={saving}>
            {saving
              ? "Saving…"
              : !firstUse
                ? "Save my answers"
                : step < last
                  ? "Continue"
                  : "See my matches"}
            {!saving && firstUse && <Icon name="arrow" size={20} />}
          </button>
          {firstUse && (
            <span className="al-muted">
              Step {step + 1} of {STEPS.length}
            </span>
          )}
        </div>
      </form>
      {firstUse && <Benefits />}
    </div>
  );
}
