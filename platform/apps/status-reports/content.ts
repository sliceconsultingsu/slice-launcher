/**
 * Everything the Status reports page shows. It is fixed public text: the app stores no client,
 * NDA or consultant data, and every name in the example is invented. `guide.md` repeats the
 * prompt word for word; `status-reports.test.ts` fails if the two drift apart.
 */

/** The copy-and-paste prompt, exactly as approved in the build inputs. */
export const PROMPT = `You are helping a Slice Consulting project manager draft a client status report.
Use ONLY the notes I paste below. Do not invent results, dates or numbers.
If something is missing, list it under "Questions for the PM".

Produce, in this order:
1. Title slide text: Status Report #[N], [date], consultants with initials, PM.
2. For each workstream, "Workstream #N - Name (consultants)" with two columns:
   Completed ([date range]) and Planned ([next date range]). Each bullet is one
   line, starts with the consultant's initials in brackets, e.g. [AB], and uses
   past tense in Completed and future tense in Planned.
3. Upcoming Schedule table: Event Title | Event Date(s) | Notes.
4. A short checklist: gaps, dates to confirm, anything that looks confidential.

Tone: professional and client-ready. This project [is / is not] under an NDA.
If it is, stop and tell me to compile the report by hand.

Notes:
[paste consultant updates here]`;

/** What a PM collects before drafting. */
export const GATHER = [
  "Each consultant's completed work since the last report",
  "Each consultant's plan for the next period",
  "Blockers",
  "Upcoming dates: meetings, deliverables and client events",
] as const;

/** The shape to ask each consultant to reply in. */
export const CONSULTANT_ASK = "Workstream, completed, planned, blockers, and any dates.";

export const DRAFTING_RULES = [
  'Use only what the notes say. Never invent results, dates or numbers; list anything missing under "Questions for the PM".',
  "Past tense in Completed, future tense in Planned. One line per bullet, led by the consultant's initials, such as [AB].",
  "Group by workstream, then by consultant. Use professional, client-ready wording.",
  "Put blockers in Planned or in your cover note, not hidden in Completed.",
  "End with a short checklist: gaps, dates to confirm, anything that looks confidential.",
  "Label the second column Planned with the next period's dates. The current template repeats the Completed dates there; fix that.",
  "Sort each bullet by tense: finished work goes in Completed even if a consultant wrote it under Planned.",
] as const;

/** Blank wording for each part of the report, in slide order. */
export const TEMPLATE = {
  fileName: "MM.DD.YY Status Report #N - Client",
  title: [
    "Status Report #[N]",
    "[Month day, year]",
    "Consultants: [Full name] [XX], [Full name] [XX]",
    "Project Manager: [Full name]",
  ],
  workstream: [
    "Workstream #[N] - [Name] ([initials of consultants])",
    "Completed ([start date] to [end date])",
    "  [XX] [What was done, past tense]",
    "Planned ([next start date] to [next end date])",
    "  [XX] [What will be done, future tense]",
  ],
  workstreamNote: "A slide holds up to two workstreams. Add slides as needed.",
  scheduleColumns: ["Event Title", "Event Date(s)", "Notes"],
} as const;

export interface Workstream {
  heading: string;
  completedLabel: string;
  completed: readonly string[];
  plannedLabel: string;
  planned: readonly string[];
}

/** A fictional report. Harbor Light and every person named here are invented. */
export const EXAMPLE = {
  client: "Harbor Light Community Fund",
  fileName: "10.20.26 Status Report #1 - Harbor Light",
  title: [
    "Status Report #1",
    "October 20, 2026",
    "Consultants: Avery Brooks [AB], Casey Dunn [CD], Eli Foster [EF]",
    "Project Manager: Gale Harmon",
  ],
  workstreams: [
    {
      heading: "Workstream #1 - Donor Survey (AB, CD)",
      completedLabel: "Completed (9/22 to 10/20)",
      completed: [
        "[AB] Drafted a 12-question donor survey and shared it with the client for comment",
        "[CD] Reviewed three comparable surveys from other nonprofits and summarized the common themes",
      ],
      plannedLabel: "Planned (10/21 to 11/3)",
      planned: [
        "[AB] Revise the survey with client feedback and prepare it for distribution",
        "[CD] Build a response-tracking sheet and a first analysis outline",
      ],
    },
    {
      heading: "Workstream #2 - Volunteer Onboarding (EF)",
      completedLabel: "Completed (9/22 to 10/20)",
      completed: [
        "[EF] Interviewed two volunteer coordinators and mapped the current onboarding steps",
      ],
      plannedLabel: "Planned (10/21 to 11/3)",
      planned: ["[EF] Draft a one-page onboarding checklist and review it with the client"],
    },
  ] satisfies Workstream[],
  schedule: [
    ["Client check-in", "10/28", "30 minutes, via video call"],
    ["Survey launch", "11/1", "Pending client approval"],
    ["Status Report #2 due", "11/3", "5 PM"],
  ],
} as const;
