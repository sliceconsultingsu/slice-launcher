"use client";
import { useState } from "react";
import type { ImportReport } from "../data/import";
import { request } from "./client";

const BATCH = 20;
/** Column headings the screen understands, and the field each one fills. */
const COLUMNS: Record<string, string> = {
  name: "fullName",
  "full name": "fullName",
  "graduation year": "graduationYear",
  "grad year": "graduationYear",
  "class year": "graduationYear",
  class: "graduationYear",
  year: "graduationYear",
  major: "majors",
  majors: "majors",
  employer: "employer",
  company: "employer",
  "current employer": "employer",
  "current company": "employer",
  title: "title",
  "job title": "title",
  role: "title",
  position: "title",
  industry: "industry",
  city: "city",
  state: "region",
  region: "region",
  country: "country",
  linkedin: "linkedin",
  "linkedin url": "linkedin",
  email: "email",
  phone: "phone",
  "help offered": "helpOffered",
  "can help with": "helpOffered",
  note: "note",
  notes: "note",
};

/** Splits pasted rows into cells. Rows copied from a spreadsheet are separated by tabs. */
function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      out.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  return [...out, cell.trim()];
}

interface Parsed {
  rows: Record<string, unknown>[];
  ignored: string[];
  problem: string | null;
}
function parse(pasted: string): Parsed {
  const lines = pasted.split(/\r?\n/).filter((line) => line.trim());
  const headings = cells(lines[0] ?? "").map((heading) =>
    heading.toLowerCase().replace(/\s+/g, " "),
  );
  const fields = headings.map((heading) => COLUMNS[heading]);
  if (!fields.includes("fullName") || !fields.includes("graduationYear"))
    return {
      rows: [],
      ignored: [],
      problem: "The first row must be the column headings, including Name and Graduation year.",
    };
  const list = (value: string) =>
    value
      .split(/[;/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const rows = lines.slice(1).map((line) => {
    const row: Record<string, unknown> = {};
    cells(line).forEach((value, index) => {
      const field = fields[index];
      if (!field || !value) return;
      if (field === "graduationYear") row[field] = /^\d{4}$/.test(value) ? Number(value) : value;
      else if (field === "majors" || field === "helpOffered") row[field] = list(value);
      else row[field] = value;
    });
    // A city with no country is assumed to be in the United States, as in the contact book.
    if (row.city && !row.country) row.country = "United States";
    return row;
  });
  return { rows, ignored: headings.filter((_, index) => !fields[index]), problem: null };
}

export function AddAlumniView() {
  const [pasted, setPasted] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const parsed = pasted.trim() ? parse(pasted) : null;
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
          Columns: Name, Graduation year, Major, Employer, Title, Industry, City, State, Country,
          LinkedIn, Email, Phone, Help offered, Note. Only Name and Graduation year are required.
          Separate several majors or kinds of help with a semicolon.
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
