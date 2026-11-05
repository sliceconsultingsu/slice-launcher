# Shared MCP access

Slice owns one remote MCP endpoint at `/mcp`. Consultants connect with an OAuth-capable Streamable HTTP client and sign in as themselves. App modules inherit identity, current membership, app/action permissions, transport and deployment. Apps register tools; they do not operate MCP servers or OAuth clients.

The checked-in catalog is empty, so the endpoint initially exposes only `slice_apps`, which returns the apps the current member may open. No membership administration or arbitrary API proxy is exposed. Code availability and production client access are separate: the operator must complete the activation steps below before advertising this endpoint to consultants.

Consultants and their agents should start with [Connect your AI](connect-your-ai.md), also linked from the launcher. That guide explains setup and troubleshooting without granting access.

## Identity and authorization

```mermaid
flowchart TD
  Client[Consultant's remote MCP client] --> OAuth[Slice OAuth: register, /authorize approval, token]
  OAuth --> Approval[/authorize with the Slice session: signed-in active member chooses Allow]
  Client --> Route[Platform /mcp with a Slice pass]
  Route --> Grant[OAuth library checks the pass; grant carries subject + email]
  Grant --> Membership[Load current D1 membership]
  Membership --> Gate[Active member + app.open + declared action]
  Gate --> Tool[App tool with scoped AppContext]
  Tool --> Rules[App record access and business rules]
```

Slice runs its own OAuth server for AI apps with `@cloudflare/workers-oauth-provider`, the approach Deal Toy uses (design: [AI connections](superpowers/specs/2026-11-05-ai-connections-design.md)). The Worker entry (`platform/worker/index.ts`, `src/ai-connections/oauth.ts`) serves:

- `/mcp`, which requires a Slice-issued pass and never accepts a `Cf-Access-Jwt-Assertion`;
- discovery metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`;
- dynamic client registration at `/oauth/register` (HTTPS callbacks, or loopback for apps on the person's computer; rate-limited per address);
- passes at `/oauth/token`: authorization code with PKCE, 7-day access passes, renewal passes that rotate and lapse after 30 days without renewal.

The approval page (`src/ai-connections/consent.ts`) uses the person's Slice session (sending them through Google sign-in first if needed), checks active membership, shows the app's self-declared name and its return address, and records a grant whose props hold the member's subject and email. The grant's user ID is a digest of the subject, so no email or subject appears in codes or passes. Grants, passes and per-grant activity (last use, last renewal) are stored in the `OAUTH_KV` namespace.

Screenshots of the approval page, the top-bar states and the connected-apps list are in [docs/images/ai-connections](images/ai-connections/).

Members list and disconnect their connected apps on the account page (`/api/membership/connections`); the launcher's top bar shows connection status. Both stay hidden until `AI_CONNECTIONS_ENABLED` is `"true"`. A client-supplied email, role or plain bearer token is not an application identity, and CI service credentials never become one.

Each protocol request loads current membership. Tool discovery includes only tools for which the active member has both `app.<id>.open` and the tool's declared action. A call reloads membership and checks both permissions again immediately before invoking app code. Pending, invited, suspended, unknown or rebound identities cannot use MCP. MCP does not enroll members: first visit the browser account page and complete the existing approval process. Revocation prevents subsequent dispatch; it cannot cancel a business operation already running.

The adapter creates a fresh server per request and stores no session identity or permission snapshot. Missing `Origin` is allowed for remote clients; when present it must match the platform origin. Cross-site browser requests are rejected. Browser app APIs retain their existing mandatory same-origin write check. No cross-origin browser CORS access is added.

## Register an app tool

First declare an action such as `records.read` in the app's catalog entry and run `pnpm apps:sync`. In `platform/apps/<id>/server.tsx`, add `tools` to the existing module:

```tsx
import { z } from "zod";
import type { AppModule } from "../../src/platform/contracts";
import { defineAppTool } from "../../src/platform/mcp-tool";
import { searchVisibleRecords } from "./records";

export default {
  Page: () => <p>Records</p>,
  tools: [
    defineAppTool({
      name: "search",
      description: "Search records visible to the current member",
      permission: "records.read",
      readOnly: true,
      inputSchema: z.object({ query: z.string().trim().min(1).max(80) }).strict(),
      async execute({ query }, context) {
        // Implement this app function with record-level access and bounded results.
        return { records: await searchVisibleRecords(context.member.id, query) };
      },
    }),
  ],
} satisfies AppModule;
```

`searchVisibleRecords` is an app implementation placeholder, not a platform API. Share business functions between page/API/tool handlers so record-level rules stay consistent. The platform automatically enforces the declared action; handlers must check any additional actions needed by conditional operations. `readOnly` supplies a client hint, not authorization or a guarantee that code cannot write. Mark writes accurately and require their own declared action. Client confirmation cannot grant a missing permission.

For an app named `alumni`, this tool is advertised as `alumni__search`. Tool names are lowercase letters/digits/underscores starting with a letter, up to 64 characters; the combined name is at most 128. Descriptions must be nonempty and at most 1,000 characters. Duplicate names, undeclared actions or more than 100 app tools fail closed. Keep schemas explicit and bounded. Tool output must be a JSON-serializable object with only data the current member may receive. Use pagination for larger results.

The transport accepts POST only, JSON responses, requests up to 16 KiB and serialized tool payloads up to 64 KiB. Protocol envelopes add overhead. It provides no persistent sessions, SSE subscriptions, resources, prompts or background tasks. Successful mutations must handle retries safely where duplicate execution would matter. Private responses are no-store and exceptions return generic messages. Add application audit history where required; the adapter does not automatically audit business operations.

CI rejects app imports of the MCP SDK and additional routes beneath `/mcp`. Use `defineAppTool` and the shared `AppContext`. Modules remain trusted code in one Worker, not sandboxes. Private tool results leave Slice for the selected MCP client and its model provider. Any MCP-capable app may connect, so approved apps are guidance, not enforcement: disclose only necessary data. See [data boundaries](data-boundary.md).

## Activate remote sign-in

Each step below is a production change and needs maintainer authorization at the time. No D1 migration is needed.

1. **Create resources.** Done November 5, 2026: the production namespace `slice-launcher-oauth` is bound as `OAUTH_KV` in `platform/wrangler.jsonc`. For a new environment, create a separate namespace (never reuse another app's, such as Deal Toy's) and set its ID through a reviewed PR. The rate limit binding (`OAUTH_LIMITER`, 20 requests a minute per address) needs no separate resource.
2. **Release with the feature off.** Deploy through the normal workflow with `AI_CONNECTIONS_ENABLED` set to `"false"`. While Access still fronts the site, AI apps cannot connect; the post-deploy check accepts either an Access redirect or Slice's challenge on `/mcp`.
3. **No Access bypass is needed.** Slice replaced Cloudflare Access with its own Google sign-in ([membership](membership.md#production-activation-checklist)); once Access is switched off, these paths are reachable directly. Do not enable Access managed OAuth.
4. **Check discovery.** Without credentials, `/mcp` must return 401 with a `WWW-Authenticate` Bearer challenge whose metadata is on the launcher's own origin, names the launcher as authorization server and `<origin>/mcp` as resource. `/api/membership` must still return 401 without a Slice session.
5. **Connect real clients.** In Claude and ChatGPT (see [Connect your AI](connect-your-ai.md) for menus), add `<origin>/mcp`, sign in, choose **Allow** on the approval page, list tools and call `slice_apps`. Confirm tool visibility matches the member's grants.
6. **Turn on the UI.** Set `AI_CONNECTIONS_ENABLED` to `"true"` through a reviewed PR and release. Confirm the top bar shows **AI connected** and the account page lists the app.
7. **Check revocation.** Disconnect the app from the account page and confirm its next request fails. Suspend a synthetic test member and confirm their connected app stops. Confirm browser sign-in and the release smoke checks still pass. Record the tested client versions and release, and remove the "awaiting setup" wording from Connect your AI and its agent instructions.

**Rollback.** A code rollback to a release before Slice OAuth makes `/mcp` fail closed for AI apps. Turning `AI_CONNECTIONS_ENABLED` off hides the status and list without revoking anything; revoke grants by disconnecting them.

Official references: [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) and the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). Versions are pinned in the launcher manifest.

## Validation

`src/platform/mcp.test.ts` exercises the real SDK client, signed synthetic identities and isolated D1 membership: filtered discovery, dispatch, revocation, cross-user isolation, service/forged identity rejection, bounded input/output and error handling. `mcp-worker.test.ts` separately bundles the adapter and performs signed discovery/calls in workerd, using a test-only identity key and state. Production build smoke checks that the compiled `/mcp` route rejects a synthetic service identity. `src/ai-connections/oauth-worker.test.ts` runs the real Slice OAuth Worker in workerd: discovery, registration rules and rate limits, PKCE sign-in, pass lifetime, renewal, revocation, suspension, identity rebinding, refusal of Access headers on `/mcp`, and that passes contain no email or subject. `consent.test.ts` covers the approval page, including replayed and cross-site approvals and hostile app names. None of these tests contacts production OAuth or uses real private data.

Run the full gate in [AGENTS.md](../AGENTS.md). App authors must add tests for their own schema, business rules, record ownership, restricted actions and denied/revoked access. The forward deployment check also requires the CI service identity to receive a private HTTP 401 from `/mcp`; rollback remains compatible with verified older releases that did not have this route.
