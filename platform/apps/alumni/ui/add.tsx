"use client";
import { useState } from "react";
import type { ImportReport } from "../data/import";
import { request } from "./client";
import { parseRows } from "./contact-book";

const BATCH = 20;

export function AddAlumniView() {
  const [pasted, setPasted] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const parsed = pasted.trim() ? parseRows(pasted) : null;
  const load = async () => {
    if (!parsed || parsed.problem || !parsed.rows.length) return;
    setMessage(null);
    const total: ImportReport = { added: 0, alreadyThere: 0, needsReview: 0, errors: [] };
    for (let start = 0; start < parsed.rows.length; start += BATCH) {
      setProgress(`Adding rows ${start + 1} to ${Math.min(start + BATCH, parsed.rows.length)}…`);
      const result = await request<ImportReport>("import", {
        method: "POST",
        // Row 1 of the sheet holds the headings, so the first person is on row 2.
        body: { firstRow: start + 2, rows: parsed.rows.slice(start, start + BATCH) },
      });
      if (!result.data) {
        setMessage(`${result.error ?? "That did not work."} Rows before this were saved.`);
        break;
      }
      total.added += result.data.added;
      total.alreadyThere += result.data.alreadyThere;
      total.needsReview += result.data.needsReview;
      total.errors.push(...result.data.errors);
    }
    setProgress(null);
    setReport(total);
  };
  return (
    <div className="form-stack alumni-card">
      <p className="alumni-muted">
        Copy rows from the alumni contact book, including the row of column headings, and paste them
        below. People already in the app are skipped, so loading the same rows twice is safe.
        Nothing you paste is saved anywhere except the alumni database.
      </p>
      <label>
        Rows from the contact book
        <textarea
          value={pasted}
          onChange={(event) => {
            setPasted(event.target.value);
            setReport(null);
          }}
          spellCheck={false}
        />
        <span className="field-note">
          The contact book's columns load as they are: Name, Company, Role, Industry, Email,
          LinkedIn, Grad Year and Date updated. Only Name and Grad Year are required. Major, City,
          State, Country, Phone, Help offered and Note are also read if the sheet has them.
        </span>
      </label>
      {parsed?.problem && (
        <p className="notice error-notice" role="alert">
          {parsed.problem}
        </p>
      )}
      {parsed && !parsed.problem && (
        <p className="notice" role="status">
          {parsed.rows.length} {parsed.rows.length === 1 ? "person" : "people"} ready to add.
          {parsed.ignored.length > 0 &&
            ` These columns will be ignored: ${parsed.ignored.join(", ")}.`}
        </p>
      )}
      {message && (
        <p className="notice error-notice" role="alert">
          {message}
        </p>
      )}
      {progress && <p role="status">{progress}</p>}
      {report && (
        <div className="notice" role="status">
          <p>
            Added {report.added}. Already in the app: {report.alreadyThere}. Waiting for an admin to
            confirm: {report.needsReview}. Not added: {report.errors.length}.
          </p>
          {report.errors.length > 0 && (
            <ul>
              {report.errors.map((error) => (
                <li key={`${error.row}-${error.message}`}>
                  Row {error.row}
                  {error.name && ` (${error.name})`}: {error.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button
        type="button"
        className="primary-button"
        disabled={!parsed || Boolean(parsed.problem) || !parsed.rows.length || progress !== null}
        onClick={() => void load()}
      >
        Add alumni
      </button>
    </div>
  );
}
