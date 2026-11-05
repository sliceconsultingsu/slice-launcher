// The member's connected AI apps: list them, and disconnect one. Browser-only (behind Access).
import type { GrantSummary, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { MembershipError, type Identity, type State } from "../membership/contracts";
import { authorizeMember } from "../platform/access";
import type { ActivityStore } from "./activity";
import type { Connection, ConnectionsResponse } from "./contracts";
import { grantUserId, REFRESH_TOKEN_TTL } from "./oauth";

export type ConnectionDeps = {
  helpers: OAuthHelpers;
  activity: ActivityStore;
  loadState: () => Promise<State>;
  enabled: boolean;
};

const MAX_CONNECTIONS = 50;
const NAME_LIMIT = 80;

function connectionName(metadata: unknown) {
  const raw = (metadata as { clientName?: unknown } | null)?.clientName;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return "Unnamed app";
  return name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT - 1)}…` : name;
}

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
