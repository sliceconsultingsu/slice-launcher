// The member's connected AI apps: list them, and disconnect one. Browser-only (needs a Slice session).
import type { GrantSummary, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { MembershipError, type Identity, type State } from "../membership/contracts";
import { authorizeMember } from "../platform/access";
import type { ActivityStore } from "./activity";
import type { Connection, ConnectionsResponse } from "./contracts";
import { grantUserId, REFRESH_TOKEN_TTL } from "./oauth";
import { cleanName } from "./supported-apps";

export type ConnectionDeps = {
  helpers: OAuthHelpers;
  activity: ActivityStore;
  loadState: () => Promise<State>;
  enabled: boolean;
};

const MAX_CONNECTIONS = 50;

/** Cleaned again here: connections approved before names were cleaned keep their stored name. */
const connectionName = (metadata: unknown) =>
  cleanName((metadata as { clientName?: unknown } | null)?.clientName) || "Unnamed app";

async function grantsOf(helpers: OAuthHelpers, userId: string) {
  const grants: GrantSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await helpers.listUserGrants(userId, { cursor });
    grants.push(...page.items);
    cursor = page.cursor;
  } while (cursor && grants.length < MAX_CONNECTIONS);
  return grants.slice(0, MAX_CONNECTIONS);
}

export async function listConnections(
  identity: Identity,
  deps: ConnectionDeps,
): Promise<ConnectionsResponse> {
  authorizeMember(await deps.loadState(), identity);
  const userId = await grantUserId(identity.subject);
  const grants = await grantsOf(deps.helpers, userId);
  const connections = await Promise.all(
    grants.map(async (grant): Promise<Connection> => {
      const activity = await deps.activity.get(userId, grant.id);
      const connectedAt = new Date(grant.createdAt * 1000);
      // Prefer the library's own sliding expiry; otherwise the sign-in lapses 30 days after the
      // last renewal (or the connection, before any renewal).
      const lapsesAt = grant.expiresAt
        ? new Date(grant.expiresAt * 1000)
        : new Date(
            (activity.renewedAt ? Date.parse(activity.renewedAt) : connectedAt.getTime()) +
              REFRESH_TOKEN_TTL * 1000,
          );
      return {
        id: grant.id,
        name: connectionName(grant.metadata),
        connectedAt: connectedAt.toISOString(),
        lastUsedAt: activity.lastUsedAt,
        lapsesAt: lapsesAt.toISOString(),
      };
    }),
  );
  return { enabled: deps.enabled, connections };
}

export async function disconnect(
  identity: Identity,
  grantId: string,
  deps: ConnectionDeps,
): Promise<void> {
  authorizeMember(await deps.loadState(), identity);
  const userId = await grantUserId(identity.subject);
  // Grants are stored under the member's own user ID, so another member's ID never matches here.
  if (!(await grantsOf(deps.helpers, userId)).some((grant) => grant.id === grantId))
    throw new MembershipError(404, "That connection was not found.");
  await deps.helpers.revokeGrant(grantId, userId);
  await deps.activity.remove(userId, grantId);
}

/**
 * Disconnects every AI app a person approved. Used when they lose access (suspended or removed),
 * so their connections do not come back if they are reinstated. Safe to repeat.
 */
export async function disconnectAll(
  subject: string,
  deps: Pick<ConnectionDeps, "helpers" | "activity">,
): Promise<number> {
  const userId = await grantUserId(subject);
  let revoked = 0;
  // Revoking changes the list, so read it again until nothing is left (bounded in case one sticks).
  for (let pass = 0; pass < 10; pass++) {
    const grants = await grantsOf(deps.helpers, userId);
    if (grants.length === 0) break;
    for (const grant of grants) {
      await deps.helpers.revokeGrant(grant.id, userId);
      await deps.activity.remove(userId, grant.id);
      revoked += 1;
    }
  }
  return revoked;
}
