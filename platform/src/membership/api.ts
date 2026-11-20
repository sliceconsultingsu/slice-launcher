import { z } from "zod";
import { readCommand } from "./auth";
import { applyCommand, auditView, effectivePermissions, enroll, memberView } from "./domain";
import { MembershipError } from "./contracts";
import type { Mutation, SignedInIdentity, State } from "./contracts";
import type { HistoryCursor, Repository } from "./repository";
import { describedFromRecord } from "../member-apps/live";

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
   * Called when an administrator's change leaves a signed-in person without active membership
   * (suspended, returned to pending, or removed). Production disconnects their AI apps here.
   */
  onAccessLoss?: (subject: string) => Promise<void>;
  /** The host member apps live under, or null while they are switched off. */
  appHost?: string | null;
};

/**
 * The signed-in person an administrator's change leaves without active membership, if any:
 * someone removed, or a member saved as suspended or pending. A repeat save counts too, so an
 * administrator can retry a disconnect that failed.
 */
function accessLost(before: State, { state: after, audit }: Mutation): string | null {
  if (audit.action !== "member.update" && audit.action !== "member.remove") return null;
  const was = before.members.find((m) => m.id === audit.targetId);
  if (!was?.subject) return null;
  return after.members.find((m) => m.id === audit.targetId)?.status === "active"
    ? null
    : was.subject;
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
/**
 * A failure's message, but only when the database raised it. Those name the failed statement or
 * constraint, not stored data. Apps and AI tools report errors through the same path, and their
 * messages may quote the records they were handling, so every other message stays out of the logs.
 */
function databaseMessage(error: unknown) {
  return error instanceof Error && error.message.startsWith("D1_")
    ? error.message.slice(0, 300)
    : undefined;
}
export function errorResponse(error: unknown): Response {
  if (error instanceof MembershipError) return json({ error: error.message }, error.status);
  console.error(
    JSON.stringify({
      event: "membership_request_failed",
      error: error instanceof Error ? error.name : "UnknownError",
      message: databaseMessage(error),
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
  const view = { appHost: deps.appHost ?? null };
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
      return json({ history: page.items.map(auditView), next: writeCursor(page.next) });
    }
    return json(memberView(state, identity.subject, view));
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
    return json(memberView(result.state, identity.subject, view));
  }
  const member = state.members.find((m) => m.subject === identity.subject);
  if (!member || member.email !== identity.email)
    throw new MembershipError(403, "Complete sign-in before making changes.");
  if (body.data.revision !== state.revision)
    throw new MembershipError(409, "Membership changed. Reload before saving.");
  // A member app is created and published by the AI tools (src/member-apps/service.ts), which
  // store its files and version record with the change. Here an app can only be managed.
  const kind = (body.data.command as { type?: unknown } | null)?.type;
  if (kind === "memberapp.create" || kind === "memberapp.publish")
    throw new MembershipError(400, "Create and publish apps through your connected AI.");
  // Making a version of a member app live describes the app as that version did.
  const command = await describedFromRecord(repository, body.data.command);
  const result = applyCommand(state, identity.subject, command, {
    id: crypto.randomUUID(),
    now: new Date().toISOString(),
  });
  if (result.audit.action === "profile.update") {
    // Saving an unchanged profile is not a change: no new revision and no history entry.
    if (JSON.stringify(result.audit.before) === JSON.stringify(result.audit.after))
      return json(memberView(state, identity.subject, view));
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
  const loser = deps.onAccessLoss ? accessLost(state, result) : null;
  const cleanUp = async (failure: string | null) => {
    if (!loser || !deps.onAccessLoss) return;
    try {
      await deps.onAccessLoss(loser);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "access_loss_cleanup_failed",
          action: result.audit.action,
          error: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      // Never reported as success: the administrator is told, and saving again retries it.
      if (failure) throw new MembershipError(502, failure);
    }
  };
  // A removed person leaves nothing to save again, so their apps are disconnected first and a
  // failure stops the removal. Suspension is the other way round: it is what keeps someone out,
  // so it is saved first and must never wait on another store.
  const removing = result.audit.action === "member.remove";
  if (removing)
    await cleanUp(
      "This person's AI apps could not be disconnected, so they were not removed. Try again.",
    );
  await repository.commit(state, result);
  // After a removal this second pass catches an app approved in the moment between the first
  // pass and the removal. The first pass just succeeded, so a failure here is only logged.
  await cleanUp(
    removing
      ? null
      : "The change was saved, but this person's AI apps could not be disconnected. Reload, then save the member again to retry.",
  );
  return json(memberView(result.state, identity.subject, view));
}
