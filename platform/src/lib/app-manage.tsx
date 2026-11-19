"use client";
import { useState, type FormEvent } from "react";
import type { AppSettings, Command, View } from "../membership/contracts";
import {
  addManager,
  addPerson,
  candidates,
  confirmsPublic,
  displayName,
  extraPowers,
  publicConfirmation,
  removeManager,
  removePerson,
  setPower,
  startingDraft,
  toCommand,
} from "./app-manage-model";
import type { LauncherApp } from "./apps";
import { publicNote, type PublicRule } from "./member-app-model";

/** Choosing a member to add to a list. Offers only people this person can already see. */
function AddMember({
  label,
  action,
  options,
  add,
}: {
  label: string;
  action: string;
  options: { id: string; label: string }[];
  add: (memberId: string) => void;
}) {
  const [pick, setPick] = useState("");
  return (
    <div className="manage-add">
      <label>
        {label}
        <select value={pick} onChange={(event) => setPick(event.target.value)}>
          <option value="">Choose a member</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          if (!pick) return;
          add(pick);
          setPick("");
        }}
      >
        {action}
      </button>
    </div>
  );
}

/**
 * The settings of one app, for the people who run it: who can open it, who holds its extra
 * powers and who manages it. Nothing is saved until Save changes; the server checks the save.
 */
export function AppManage({
  app,
  view,
  settings,
  save,
  busy,
  publicRule = "free",
  publicRequestedBy = null,
}: {
  app: LauncherApp;
  view: View;
  settings: AppSettings;
  save: (command: Command) => void;
  busy: boolean;
  /** What saving as Public does; member apps need an owner's OK once (docs/member-apps.md). */
  publicRule?: PublicRule;
  /** The name of the manager whose request to make it Public is waiting, if any. */
  publicRequestedBy?: string | null;
}) {
  const [draft, setDraft] = useState(() =>
    startingDraft(settings, app, publicRule === "ask" && publicRequestedBy !== null),
  );
  const [confirming, setConfirming] = useState(false);
  const powers = extraPowers(app);
  const isPublic = draft.visibility === "public";
  const steppingDown = !view.me.owner && !draft.managers.includes(view.me.id);
  const edit = (next: AppSettings) => {
    setDraft(next);
    setConfirming(false);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (confirmsPublic(settings, draft, publicRule) && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    save(toCommand(draft));
  };
  return (
    <form className="app-manage" onSubmit={submit}>
      <fieldset disabled={busy}>
        <fieldset className="manage-group">
          <legend>Who can open it</legend>
          <label className="check-label">
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={isPublic}
              onChange={() => edit({ ...draft, visibility: "public" })}
            />
            <span>
              <strong>Public</strong>
              <span className="field-note">{publicNote(publicRule, publicRequestedBy)}</span>
            </span>
          </label>
          <label className="check-label">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={!isPublic}
              onChange={() => edit({ ...draft, visibility: "private" })}
            />
            <span>
              <strong>Private</strong>
              <span className="field-note">Only the people you add below</span>
            </span>
          </label>
        </fieldset>
        <div className="manage-group">
          <h3>People</h3>
          <p className="field-note">
            {isPublic
              ? powers.length
                ? "Everyone can open this app. Add someone here to give them an extra power."
                : "Everyone can open this app."
              : "Only these people, and the app's managers, can open this app."}
          </p>
          {draft.people.length === 0 ? (
            <p className="field-note">No one has been added.</p>
          ) : (
            <ul className="manage-list">
              {draft.people.map((person) => {
                const name = displayName(view, person.memberId);
                return (
                  <li key={person.memberId}>
                    <span className="manage-name">{name}</span>
                    {powers.map((power) => (
                      <label className="check-label" key={power.id}>
                        <input
                          type="checkbox"
                          checked={person.powers.includes(power.id)}
                          onChange={(event) =>
                            edit(setPower(draft, person.memberId, power.id, event.target.checked))
                          }
                        />
                        <span>
                          {power.label}
                          <span className="sr-only"> for {name}</span>
                        </span>
                      </label>
                    ))}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => edit(removePerson(draft, person.memberId))}
                    >
                      Remove<span className="sr-only"> {name} from people</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <AddMember
            label="Add a person"
            action="Add person"
            options={candidates(
              view,
              draft.people.map((person) => person.memberId),
            )}
            add={(memberId) => edit(addPerson(draft, memberId))}
          />
        </div>
        <div className="manage-group">
          <h3>Managers</h3>
          <p className="field-note">
            Managers can change these settings and hold all of this app&apos;s powers. The Slice
            owner can always manage every app.
          </p>
          {draft.managers.length === 0 ? (
            <p className="field-note">No managers yet. The Slice owner runs this app.</p>
          ) : (
            <ul className="manage-list">
              {draft.managers.map((memberId) => {
                const name = displayName(view, memberId);
                return (
                  <li key={memberId}>
                    <span className="manage-name">{name}</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => edit(removeManager(draft, memberId))}
                    >
                      Remove<span className="sr-only"> {name} from managers</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <AddMember
            label="Add a manager"
            action="Add manager"
            options={candidates(view, draft.managers)}
            add={(memberId) => edit(addManager(draft, memberId))}
          />
          {steppingDown && (
            <p className="notice">
              You are not listed as a manager. After you save, you will no longer be able to change
              these settings.
            </p>
          )}
        </div>
        {confirming ? (
          <div className="notice manage-confirm" role="alert">
            <p>{publicConfirmation(app.name, view.counts ?? { active: 0, invited: 0 })}</p>
            <div className="manage-actions">
              <button className="primary-button" type="submit">
                Open to everyone
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="primary-button" type="submit">
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}
      </fieldset>
    </form>
  );
}
