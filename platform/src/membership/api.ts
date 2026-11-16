import { z } from "zod";
import { readCommand } from "./auth";
import { applyCommand, effectivePermissions, enroll, memberView } from "./domain";
import { MembershipError } from "./contracts";
import type { SignedInIdentity, State } from "./contracts";
import type { HistoryCursor, Repository } from "./repository";

/** Profile edits one person may save in a day. Each one adds an entry to access history. */
export const PROFILE_EDITS_PER_DAY = 20;
const DAY_MS = 86400_000;

export type MembershipDeps = {
  /**
   * Counts one change against this person's short-term allowance; false once it is used up.
   * Production passes a per-person rate limiter. Without one, changes are not limited.
   */
  allowWrite?: (subject: string) => Promise<boolean>;
  /**
   * Called after a change that takes active membership away from a signed-in person (suspended,
   * returned to pending) or removes them. Production disconnects their AI apps here.
   */
  onAccessLoss?: (subject: string) => Promise<void>;
};

/** Signed-in people who were removed in this commit, or were active before it and are not now. */
function lostAccess(before: State, after: State): string[] {
  const subjects: string[] = [];
  for (const member of before.members) {
    if (!member.subject) continue;
    const now = after.members.find((m) => m.id === member.id);
    if (!now || (member.status === "active" && now.status !== "active"))
      subjects.push(member.subject);
  }
  return subjects;
}

/** History pages are addressed by an opaque token the previous page returned. */
function readCursor(value: string | null): HistoryCursor | undefined {
  if (value === null) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2}T[\d:.]{8,12}Z)~(\d{1,15})$/.exec(value);
  if (!match) throw new MembershipError(400, "Invalid history request.");
  return { at: match[1], position: Number(match[2]) };
}
const writeCursor = (cursor: HistoryCursor | null) =>
  cursor ? `${cursor.at}~${cursor.position}` : null;
const envelope = z.strictObject({
  revision: z.number().int().nonnegative().optional(),
  command: z.unknown(),
});
const join = z.strictObject({ type: z.literal("join") });
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function errorResponse(error: unknown): Response {
  if (error instanceof MembershipError) return json({ error: error.message }, error.status);
  console.error(
    JSON.stringify({
      event: "membership_request_failed",
      error: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return json({ error: "Membership could not be loaded. Please try again." }, 500);
}
export async function membershipRequest(
  request: Request,
  identity: SignedInIdentity,
  repository: Repository,
  deps: MembershipDeps = {},
): Promise<Response> {
  const state = await repository.load();
  if (request.method === "GET") {
    const member = state.members.find((m) => m.subject === identity.subject);
    if (!member) return json({ needsEnrollment: true });
    if (member.email !== identity.email)
      throw new MembershipError(403, "Your identity changed. Contact an administrator.");
    const query = new URL(request.url).searchParams;
    if (query.get("view") === "history") {
      if (!effectivePermissions(state, member).includes("audit.read"))
        throw new MembershipError(403, "You do not have permission to view access history.");
      const page = await repository.historyPage({
        includeProfileEdits: query.get("profileEdits") === "1",
        before: readCursor(query.get("before")),
      });
      return json({ history: page.items, next: writeCursor(page.next) });
    }
    return json(memberView(state, identity.subject));
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const body = envelope.safeParse(await readCommand(request));
  if (!body.success) throw new MembershipError(400, "Invalid membership request.");
  if (deps.allowWrite && !(await deps.allowWrite(identity.subject)))
    throw new MembershipError(429, "Too many changes at once. Wait a minute, then try again.");
  if (join.safeParse(body.data.command).success) {
    const result = enroll(state, identity, {
      id: crypto.randomUUID(),
      now: new Date().toISOString(),
    });
    if (result.audit) await repository.commit(state, { ...result, audit: result.audit });
    return json(memberView(result.state, identity.subject));
  }
  const member = state.members.find((m) => m.subject === identity.subject);
  if (!member || member.email !== identity.email)
    throw new MembershipError(403, "Complete sign-in before making changes.");
  if (body.data.revision !== state.revision)
    throw new MembershipError(409, "Membership changed. Reload before saving.");
  const result = applyCommand(state, identity.subject, body.data.command, {
    id: crypto.randomUUID(),
    now: new Date().toISOString(),
  });
  if (result.audit.action === "profile.update") {
    // Saving an unchanged profile is not a change: no new revision and no history entry.
    if (JSON.stringify(result.audit.before) === JSON.stringify(result.audit.after))
      return json(memberView(state, identity.subject));
    // Anyone signed in can edit their own profile, so a daily cap keeps one person from
    // filling access history.
    const since = new Date(Date.now() - DAY_MS).toISOString();
    if (
      (await repository.actionsSince(member.id, "profile.update", since)) >= PROFILE_EDITS_PER_DAY
    )
      throw new MembershipError(
        429,
        "You have changed your profile many times today. Try again tomorrow.",
      );
  }
  await repository.commit(state, result);
  if (deps.onAccessLoss)
    for (const subject of lostAccess(state, result.state)) {
      try {
        await deps.onAccessLoss(subject);
      } catch (error) {
        // The membership change is already saved and takes effect on the person's next request.
        // Their connections are also refused at renewal, so a failure here is logged, not fatal.
        console.error(
          JSON.stringify({
            event: "access_loss_cleanup_failed",
            error: error instanceof Error ? error.name : "UnknownError",
          }),
        );
      }
    }
  return json(memberView(result.state, identity.subject));
}
