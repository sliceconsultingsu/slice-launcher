// Slice's own sign-in for AI apps (MCP clients), modelled on Deal Toy's Mantel setup.
// Pages and APIs use the Slice session from Google sign-in; these OAuth paths accept only passes
// this provider issued. See docs/superpowers/specs/2026-11-05-ai-connections-design.md.
import {
  getOAuthApi,
  OAuthError,
  OAuthProvider,
  type OAuthHelpers,
  type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";
import type { Identity, State } from "../membership/contracts";
import { appHost, movedTo, type AddressEnv } from "../platform/address";
import { withSecurityHeaders } from "../platform/security-headers";
import { ActivityStore } from "./activity";
import { returnTarget } from "./supported-apps";

/** Access passes last a week; every request still reloads the member's current access. */
export const ACCESS_TOKEN_TTL = 7 * 86400;
/** Renewal passes rotate and lapse after 30 days without renewal. */
export const REFRESH_TOKEN_TTL = 30 * 86400;
/** The single scope: a connected app acts as the member, with exactly their access. */
export const SCOPE = "slice";

/** What a grant carries to /mcp. `grantId` is added to access passes on every exchange. */
export type GrantProps = { subject: string; email: string; clientId: string; grantId?: string };

export type OAuthEnv = { OAUTH_KV: KVNamespace };
export type SliceWorkerEnv = OAuthEnv & AddressEnv & { OAUTH_LIMITER: RateLimit };
type McpHandler<Env> = (request: Request, identity: Identity, env: Env) => Promise<Response>;

/**
 * The grant's user ID. The library puts it in plain text at the front of every code and pass,
 * and forbids ":", which some member subjects contain, so it is a digest of the subject instead.
 */
export async function grantUserId(subject: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`slice-oauth-user:${subject}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function oauthOptions<Env extends OAuthEnv>(
  origin: string,
  deps: {
    mcp: McpHandler<Env>;
    defaultHandler: ExportedHandler<Env>;
    activity?: (env: Env) => ActivityStore;
    /** Current membership, checked before any pass is issued or renewed. */
    loadState?: (env: Env) => Promise<State>;
  },
): OAuthProviderOptions<Env> {
  const activity = deps.activity ?? ((env: Env) => new ActivityStore(env.OAUTH_KV));
  return {
    apiRoute: "/mcp",
    apiHandler: {
      async fetch(request, env, ctx) {
        const props = (ctx as ExecutionContext & { props: GrantProps }).props;
        const response = await deps.mcp(
          request,
          { subject: props.subject, email: props.email },
          env,
        );
        if (props.grantId) {
          const grantId = props.grantId;
          ctx.waitUntil(
            grantUserId(props.subject).then((userId) => activity(env).touch(userId, grantId)),
          );
        }
        return response;
      },
    },
    defaultHandler: deps.defaultHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    accessTokenTTL: ACCESS_TOKEN_TTL,
    refreshTokenTTL: REFRESH_TOKEN_TTL,
    refreshTokenIdleTTL: REFRESH_TOKEN_TTL,
    scopesSupported: [SCOPE],
    requiredScopes: [SCOPE],
    resourceMetadata: {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      resource_name: "Slice",
    },
    clientRegistrationCallback({ clientMetadata }) {
      const uris = clientMetadata.redirect_uris;
      if (!Array.isArray(uris) || uris.length === 0 || !uris.every(returnTarget))
        return {
          code: "invalid_redirect_uri",
          description: "Use an HTTPS address, or a local address for apps on this computer.",
        };
    },
    async tokenExchangeCallback({ userId, grantId, props, env }) {
      // A pass is issued or renewed only for someone who is an active member right now.
      // Refusing with invalid_grant also makes the library revoke the connection, so it cannot
      // come back to life if the person is reinstated later.
      if (deps.loadState) {
        const { subject, email } = props as GrantProps;
        const member = (await deps.loadState(env)).members.find((m) => m.subject === subject);
        if (!member || member.email !== email || member.status !== "active") {
          await activity(env).remove(userId, grantId);
          throw new OAuthError("invalid_grant", {
            description: "This connection is no longer valid. Connect to Slice again.",
          });
        }
      }
      await activity(env).renewed(userId, grantId);
      return { accessTokenProps: { ...(props as GrantProps), grantId } };
    },
  };
}

const inert: ExportedHandler<OAuthEnv> = {
  fetch: () => new Response("Not available", { status: 500 }),
};

/** Helpers (grants, consent) for route handlers that run outside the provider's own dispatch. */
export function oauthHelpers(env: OAuthEnv, origin: string): OAuthHelpers {
  return getOAuthApi(
    oauthOptions<OAuthEnv>(origin, {
      mcp: async () => new Response("Not available", { status: 500 }),
      defaultHandler: inert,
    }),
    env,
  );
}

const rateLimited = ["/oauth/register", "/oauth/token"];
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

/**
 * Whether this is the page framework's image endpoint. Slice serves its images as static files,
 * and the framework's own answer on this path redirects to the address it is given, so the Worker
 * refuses it. Deliberately looser than the framework's own matching (which decodes the path and
 * ignores repeated and trailing slashes): refusing a near miss costs nothing.
 */
export function imageEndpoint(pathname: string) {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Not valid encoding: match it as written.
  }
  return /^\/+_(?:vi)?next\/+image\/*$/i.test(path);
}
const privatePath = (path: string) =>
  path === "/mcp" || path.startsWith("/oauth/") || path.startsWith("/.well-known/oauth-");

/**
 * The Slice Worker: sends plain HTTP to HTTPS and retired addresses to the launcher's address
 * (docs/launcher-address.md), answers member apps' addresses apart from everything else, refuses
 * the unused image endpoint, rate limits
 * sign-in endpoints, then hands every request to the OAuth provider, which serves /mcp and the
 * OAuth endpoints and passes everything else to the app.
 */
export function createSliceWorker<Env extends SliceWorkerEnv>(deps: {
  defaultHandler: ExportedHandler<Env>;
  mcp: McpHandler<Env>;
  loadState: (env: Env) => Promise<State>;
  /**
   * Answers a member app's address (docs/member-apps.md), or null while member apps are
   * switched off. Left out, no app address is served.
   */
  memberApp?: (request: Request, env: Env, appId: string) => Promise<Response> | null;
}): ExportedHandler<Env> {
  const providers = new Map<string, OAuthProvider<Env>>();
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      // Plain HTTP is sent to HTTPS before anything else runs. Cookies and passes are HTTPS-only,
      // and the sign-in code below refuses to build itself for a plain HTTP address.
      if (url.protocol === "http:" && !LOCAL_HOSTS.includes(url.hostname)) {
        url.protocol = "https:";
        return withSecurityHeaders(
          new Response(null, {
            status: 308,
            headers: { Location: url.toString(), "Cache-Control": "public, max-age=86400" },
          }),
        );
      }
      // A retired address answers nothing itself: every request is sent to the launcher's
      // address with its method, path and query. Not cached, so the setting can be turned off.
      const moved = movedTo(url, env);
      if (moved)
        return withSecurityHeaders(
          new Response(null, {
            status: 308,
            headers: { Location: moved, "Cache-Control": "no-store" },
          }),
        );
      // A name under the launcher's host is a member app's address or nobody's. Either way it
      // never reaches the launcher's own pages, sign-in or AI sign-in below.
      const app = appHost(url, env);
      if (app !== null) {
        const answered = app && deps.memberApp ? await deps.memberApp(request, env, app) : null;
        return withSecurityHeaders(
          answered ??
            new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } }),
        );
      }
      if (imageEndpoint(url.pathname))
        return withSecurityHeaders(
          new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } }),
        );
      if (request.method === "POST" && rateLimited.includes(url.pathname)) {
        const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
        const { success } = await env.OAUTH_LIMITER.limit({ key: `${url.pathname}:${address}` });
        if (!success)
          return withSecurityHeaders(
            secure(Response.json({ error: "rate_limited" }, { status: 429 })),
          );
      }
      let provider = providers.get(url.origin);
      if (!provider) {
        provider = new OAuthProvider<Env>(oauthOptions(url.origin, deps));
        providers.set(url.origin, provider);
      }
      let response = (await provider.fetch(request as never, env, ctx)) as unknown as Response;
      if (
        url.pathname === "/mcp" &&
        response.status === 401 &&
        !response.headers.get("content-type")
      )
        response = signInRequired(response);
      return withSecurityHeaders(privatePath(url.pathname) ? secure(response) : response);
    },
  };
}

/** The library's bare 401 challenge, with a JSON body like Slice's other protected APIs. */
function signInRequired(challenge: Response) {
  const headers = new Headers(challenge.headers);
  headers.set("Content-Type", "application/json");
  return new Response(
    JSON.stringify({
      error: "invalid_token",
      error_description: "Sign in to Slice from your AI app to use this connection.",
    }),
    { status: 401, headers },
  );
}

function secure(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
