// Reads rows pasted from the alumni contact book into the fields the app's loader expects.
// Pure functions with no network or storage, so the reading rules can be tested on their own.

/** Column headings the Add alumni screen understands, and the field each one fills. */
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
  "date updated": "verifiedOn",
  "last updated": "verifiedOn",
  "last verified": "verifiedOn",
};

/** Splits one pasted line into cells. Rows copied from a spreadsheet are separated by tabs. */
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

/** A date such as "April 1, 2025" or "4/1/2025" as 2025-04-01. Unreadable text is kept as given. */
function day(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const two = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export interface ParsedRows {
  rows: Record<string, unknown>[];
  /** Column headings that were not recognized and will not be loaded. */
  ignored: string[];
  problem: string | null;
}

/** The first line must hold the column headings. Blank lines and blank cells are skipped. */
export function parseRows(pasted: string): ParsedRows {
  const lines = pasted.split(/\r?\n/).filter((line) => line.trim());
  const headings = cells(lines[0] ?? "").map((heading) =>
    heading.toLowerCase().replace(/\s+/g, " "),
  );
  const fields = headings.map((heading) => COLUMNS[heading]);
  if (!fields.includes("fullName") || !fields.includes("graduationYear"))
    return {
      rows: [],
      ignored: [],
      problem: "The first row must be the column headings, including Name and Grad year.",
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
      else if (field === "verifiedOn") row[field] = day(value);
      else row[field] = value;
    });
    // A city with no country is assumed to be in the United States, as in the contact book.
    if (row.city && !row.country) row.country = "United States";
    return row;
  });
  return { rows, ignored: headings.filter((_, index) => !fields[index]), problem: null };
}
