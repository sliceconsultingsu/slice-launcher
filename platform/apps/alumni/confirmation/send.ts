// Sends confirmation emails, a few at a time, and keeps the log of who was asked.
//
// Only an admin can start a send, and the platform has no timer, so nothing goes out by itself.
// Each email goes to one alum at the address already on file for them. A request can never
// supply an address. Replies go to the admin who pressed send.
import type { AlumniData } from "../data/services";
import { CONFIRM_INTERVAL_DAYS, RETRY_AFTER_HOURS, SEND_BATCH_MAX, SENDER_NAME } from "./config";
import type { Mailer } from "./mail";
import { confirmationMessage } from "./message";

export interface ConfirmationPerson {
  personId: string;
  fullName: string;
  /** False when there is no email address on file, so they cannot be asked this way. */
  hasEmail: boolean;
  /** When the last email was accepted by the mail service; null if never. */
  askedAt: string | null;
  /** When the mail service last refused an email to them; null if never. */
  failedAt: string | null;
  /** When an admin last recorded their reply; null if never. */
  answeredAt: string | null;
  /** True when pressing send would email them now. */
  due: boolean;
}
export interface SendResult {
  sent: number;
  /** Emails the mail service refused for that one recipient. They are retried after a day. */
  failed: number;
  /** Alumni still due after this request. */
  remaining: number;
  /** Set when sending had to stop for a reason that affects every email, in plain words. */
  stopped: string | null;
}

interface Row {
  id: string;
  full_name: string;
  graduation_year: number;
  job_title: string | null;
  employer: string | null;
  contact_id: string | null;
  email: string | null;
  asked_at: string | null;
  failed_at: string | null;
  answered_at: string | null;
}
const EMAIL = (column: string) =>
  `(SELECT c.${column} FROM alumni_contacts c WHERE c.person_id = p.id AND c.kind = 'email' ORDER BY c.updated_at DESC, c.id LIMIT 1)`;
const REQUEST = (column: string, where: string) =>
  `(SELECT max(r.${column}) FROM alumni_confirmation_requests r WHERE r.person_id = p.id${where})`;

/** Problems that would stop every email, so the batch ends and nothing is logged against anyone. */
const STOP: Record<string, string> = {
  E_SENDER_NOT_VERIFIED: "The sending address is not set up with the mail service yet.",
  E_SENDER_DOMAIN_NOT_AVAILABLE: "The sending address is not set up with the mail service yet.",
  E_ACCOUNT_SUSPENDED: "The mail service has paused sending for this account.",
  E_DAILY_LIMIT_EXCEEDED: "Today's sending limit has been reached. Try again tomorrow.",
  E_RATE_LIMIT_EXCEEDED: "The mail service asked us to slow down. Try again in a few minutes.",
  E_INTERNAL_SERVER_ERROR: "The mail service is not available right now. Try again later.",
};

function before(now: string, milliseconds: number): string {
  return new Date(Date.parse(now) - milliseconds).toISOString();
}
function codeOf(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

/** Every listed alum whose record is not merged away, with where they stand. Admins only. */
async function people(data: AlumniData): Promise<(Row & { due: boolean })[]> {
  const now = data.now();
  const askAgainAfter = before(now, CONFIRM_INTERVAL_DAYS * 86_400_000);
  const retryAfter = before(now, RETRY_AFTER_HOURS * 3_600_000);
  const rows = (
    await data.db
      .prepare(
        `SELECT p.id, p.full_name, p.graduation_year, pr.job_title, e.name AS employer,
           ${EMAIL("id")} AS contact_id, ${EMAIL("value")} AS email,
           ${REQUEST("requested_at", " AND r.outcome = 'sent'")} AS asked_at,
           ${REQUEST("requested_at", " AND r.outcome = 'failed'")} AS failed_at,
           ${REQUEST("answered_at", "")} AS answered_at
         FROM alumni_profiles pr
         JOIN alumni_people p ON p.id = pr.person_id
         LEFT JOIN alumni_employers e ON e.id = pr.job_employer_id
         WHERE p.merged_into IS NULL AND pr.listing_status = 'listed'
         ORDER BY p.name_key, p.id`,
      )
      .all<Row>()
  ).results;
  return rows.map((row) => ({
    ...row,
    due:
      row.email !== null &&
      (row.asked_at === null || row.asked_at <= askAgainAfter) &&
      (row.failed_at === null || row.failed_at <= retryAfter),
  }));
}

export async function confirmationPeople(data: AlumniData): Promise<ConfirmationPerson[]> {
  return (await people(data)).map((row) => ({
    personId: row.id,
    fullName: row.full_name,
    hasEmail: row.email !== null,
    askedAt: row.asked_at,
    failedAt: row.failed_at,
    answeredAt: row.answered_at,
    due: row.due,
  }));
}

export async function sendConfirmations(
  data: AlumniData,
  mailer: Mailer,
  admin: { id: string; name: string; email: string },
  input: { limit?: number } = {},
): Promise<SendResult> {
  const due = (await people(data)).filter((row) => row.due);
  const result: SendResult = { sent: 0, failed: 0, remaining: due.length, stopped: null };
  const now = data.now();
  for (const person of due.slice(0, Math.min(input.limit ?? SEND_BATCH_MAX, SEND_BATCH_MAX))) {
    if (!person.email || !person.contact_id) continue;
    // Log the email before sending, and only if nobody else has just logged one for this alum.
    // Two admins pressing send at the same moment therefore send one email, not two.
    const id = data.newId();
    const claim = await data.db
      .prepare(
        `INSERT INTO alumni_confirmation_requests(id, person_id, contact_id, requested_at, requested_by, outcome)
         SELECT ?, ?, ?, ?, ?, 'sent' WHERE NOT EXISTS (
           SELECT 1 FROM alumni_confirmation_requests r WHERE r.person_id = ?
             AND ((r.outcome = 'sent' AND r.requested_at > ?) OR (r.outcome = 'failed' AND r.requested_at > ?)))`,
      )
      .bind(
        id,
        person.id,
        person.contact_id,
        now,
        admin.id,
        person.id,
        before(now, CONFIRM_INTERVAL_DAYS * 86_400_000),
        before(now, RETRY_AFTER_HOURS * 3_600_000),
      )
      .run();
    if (!claim.meta.changes) {
      result.remaining--;
      continue;
    }
    try {
      const sent = await mailer.sender.send({
        to: person.email,
        from: { email: mailer.from, name: SENDER_NAME },
        replyTo: admin.email,
        ...confirmationMessage({
          fullName: person.full_name,
          graduationYear: person.graduation_year,
          job:
            person.job_title && person.employer
              ? { title: person.job_title, employer: person.employer }
              : null,
          adminName: admin.name,
        }),
      });
      await data.db
        .prepare("UPDATE alumni_confirmation_requests SET message_id = ? WHERE id = ?")
        .bind(sent.messageId, id)
        .run();
      result.sent++;
      result.remaining--;
    } catch (error) {
      const code = codeOf(error);
      if (!code || STOP[code]) {
        // Nothing was sent and the cause is not this alum, so they stay due.
        await data.db
          .prepare("DELETE FROM alumni_confirmation_requests WHERE id = ?")
          .bind(id)
          .run();
        result.stopped =
          (code && STOP[code]) ??
          "The mail service returned an unexpected error. Nothing more was sent.";
        break;
      }
      await data.db
        .prepare(
          "UPDATE alumni_confirmation_requests SET outcome = 'failed', detail = ? WHERE id = ?",
        )
        .bind(code.slice(0, 200), id)
        .run();
      result.failed++;
      result.remaining--;
    }
  }
  return result;
}
