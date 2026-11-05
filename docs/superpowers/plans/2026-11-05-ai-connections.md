# AI Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI apps sign in to Slice's MCP server through Slice's own OAuth, and members see connection status in the top bar and manage connected apps on their account page.

**Architecture:** A custom Worker entry wraps vinext's fetch handler in `@cloudflare/workers-oauth-provider`. The provider owns `/mcp` and the OAuth endpoints, which Cloudflare Access will bypass. Everything else, including the new `/authorize` approval page, stays behind Access. Grant props carry the member's Access subject and email, so every `/mcp` request reloads current membership through the existing MCP adapter. Last-use and renewal times live in the same KV namespace under a Slice prefix.

**Tech Stack:** Cloudflare Workers, vinext 1.0.1, `@cloudflare/workers-oauth-provider` 1.2.4 (the version Deal Toy runs), Workers KV, Workers rate limiting, D1 (read only), React 19, Vitest 5, Miniflare, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-ai-connections-design.md`. Executors read it before starting. Deal Toy's working version is in `UnitedAI-Projects/deal-toy` (`src/server/oauth.ts`, `src/server/consent.ts`, `src/server/settings.ts`); copy its patterns, not its Google sign-in.

## Global Constraints

- **Branch and PR.** Work on `feat/ai-connections`, created from `main` after PR #60 (design and plan) merges, and deliver as one PR. Commit as `ichen27 <ivan27chen@gmail.com>`, with no AI attribution anywhere.
- **Toolchain.** Node and pnpm versions come from the root `package.json`. Install with `pnpm install --frozen-lockfile`.
- **Gate.** Before handoff, run every `validation.yml` step:
  - `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`;
  - `pnpm test:migrations`, `pnpm test:e2e`, `pnpm test:team`;
  - `pnpm smoke:launcher`, `pnpm build`.
- **Pass lifetimes.** `ACCESS_TOKEN_TTL = 7 * 86400`, `REFRESH_TOKEN_TTL = 30 * 86400`, and `refreshTokenIdleTTL = REFRESH_TOKEN_TTL`.
- **Scope and endpoints.**
  - Scope: exactly `"slice"`.
  - `apiRoute: "/mcp"`, `authorizeEndpoint: "/authorize"`, `tokenEndpoint: "/oauth/token"`, `clientRegistrationEndpoint: "/oauth/register"`.
- **Bindings.**
  - `OAUTH_KV`: KV namespace.
  - `OAUTH_LIMITER`: rate limit, `simple: { limit: 20, period: 60 }`.
  - `AI_CONNECTIONS_ENABLED`: var, `"false"` in `wrangler.jsonc`. The feature shows only when the value is exactly `"true"`.
- **Access bypass.** Only these paths skip Access: `/mcp`, `/oauth/token`, `/oauth/register`, and `/.well-known/oauth-protected-resource*` / `/.well-known/oauth-authorization-server*`. `/mcp` must never accept a `Cf-Access-Jwt-Assertion` identity.
- **Grants.**
  - `userId` = first 32 hex characters of SHA-256 of `slice-oauth-user:<Access subject>`.
  - Props are `{ subject, email, clientId }`, plus `grantId` on access tokens.
  - No email or subject may appear in codes or passes.
- **Activity rules.** Last use is recorded at most once every 5 minutes per grant. "Idle" means no use for 7 days. "Ends soon" means the sign-in lapses within 3 days. Lapse = last renewal (or connection) + 30 days.
- **Exact copy from the spec:**
  - approval statement: "This app will be able to use Slice as you, with your current access."
  - account explanation: "Apps you allowed through sign-in. They act as you, with your current access. Disconnecting one stops it at once."
  - empty state: "No connected apps."
  - top bar labels: "Connect your AI", "AI connected", "AI connected · idle", "AI sign-in ends in N days" ("1 day" when N = 1).
- **Unchanged limits.** The 16 KiB request limit, 64 KiB tool results, the cross-site `Origin` rejection and private/no-store responses on `/mcp` all stay.
- **Production.** No production configuration, KV creation, Access change or deploy outside the normal release workflow without maintainer authorization. Local tests use synthetic identities only.

## Review Focus

1. **Identity rebinding.** A member whose stored subject or email no longer matches the grant gets 403 from `/mcp`, even with a valid pass (Task 2).
2. **Stale or replayed approval.** An expired or invalid authorization request, a second POST of the same consent form, or a POST naming a different signed-in account shows "Approval expired" and creates no grant (Task 3).
3. **Revoked grant renewal.** After Disconnect, the old refresh pass can't get a new access pass, and the old access pass gets 401 (Task 4).
4. **Status request failure.** When `/api/membership/connections` errors, times out or returns 403, the header still renders with no status (Task 5).
5. **Hostile client names.** A client name containing markup, a very long string or no name renders escaped and truncated to 80 characters ("Unnamed app" when empty) on the approval page and in the account list (Tasks 3 and 6).

---

### Task 1: Custom Worker entry around vinext

Proves vinext can be wrapped before anything depends on it.

**Files:**

- Create: `platform/worker/index.ts`
- Modify: `platform/wrangler.jsonc` (`main`), `platform/tsconfig.json` (include `worker`)
- Test: existing `pnpm build`, `pnpm smoke:launcher`, `pnpm test:e2e`

**Interfaces:**

- Produces: `platform/worker/index.ts` default export `{ fetch(request, env, ctx) }`, delegating to `vinext/server/fetch-handler`'s default export. Task 2 replaces the body.

- [ ] **Step 1: Point `main` at `./worker/index.ts`; the entry imports the vinext handler and forwards `fetch` unchanged.**
- [ ] **Step 2: Run `pnpm --filter @slice/launcher build && pnpm smoke:launcher`.** Expected: build succeeds and the smoke check passes, exactly as before.
- [ ] **Step 3: Run `pnpm --filter @slice/launcher dev`, then load `/` and `/api/health`.** Expected: same responses as on `main`.
- [ ] **Step 4: If any step fails, stop.** Report the error and do not continue to Task 2. The spec's fallback (route handlers with `getOAuthApi`) needs the maintainer's go-ahead.
- [ ] **Step 5: Commit** with the message `Wrap the vinext handler in a Slice Worker entry`.

### Task 2: OAuth provider, `/mcp` through grants, activity records

**Files:**

- Create: `platform/src/ai-connections/oauth.ts`, `platform/src/ai-connections/activity.ts`
- Create: `platform/tests/ai-connections/worker.ts` (synthetic workerd fixture)
- Modify: `platform/worker/index.ts`, `platform/wrangler.jsonc`, `platform/worker-configuration.d.ts` (`pnpm cf-typegen`), `platform/package.json` (add `@cloudflare/workers-oauth-provider@1.2.4`), `scripts/check-architecture.mjs`
- Delete: `platform/app/mcp/route.ts`; the provider owns `/mcp`
- Test: `platform/src/ai-connections/oauth-worker.test.ts`, `platform/src/ai-connections/activity.test.ts`

**Interfaces:**

- Consumes: `createMcpAdapter(dependencies)` from `src/platform/mcp.ts`; `Identity` and `State` from `src/membership/contracts.ts`; `Repository` and `apps`/`modules` as in `src/platform/runtime.ts`.
- Produces, in `oauth.ts`:
  - constants: `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `SCOPE`;
  - `type GrantProps = { subject: string; email: string; clientId: string; grantId?: string }`;
  - `grantUserId(subject: string): Promise<string>`;
  - `type OAuthEnv = { OAUTH_KV: KVNamespace }`;
  - `oauthOptions(origin: string, deps: { mcp: (request: Request, identity: Identity) => Promise<Response>; activity: (env: OAuthEnv) => ActivityStore; defaultHandler: ExportedHandler }): OAuthProviderOptions`;
  - `oauthHelpers(env: OAuthEnv, origin: string): OAuthHelpers`, via `getOAuthApi` with inert handlers that return 500.
- Produces, in `activity.ts`:
  - `type Activity = { lastUsedAt: string | null; renewedAt: string | null }`;
  - `class ActivityStore`:
    - `constructor(kv: KVNamespace, now: () => Date = () => new Date())`;
    - `touch(userId: string, grantId: string): Promise<void>`;
    - `renewed(userId: string, grantId: string): Promise<void>`;
    - `get(userId: string, grantId: string): Promise<Activity>`;
    - `remove(userId: string, grantId: string): Promise<void>`;
  - key format: `slice-activity:<userId>:<grantId>`.

- [ ] **Step 1: Write failing `activity.test.ts`.** Use an in-memory KV stub.
  - `touch twice within 5 minutes writes once`: the second call does not change `lastUsedAt`.
  - `touch after 5 minutes updates lastUsedAt`.
  - `renewed records renewedAt`.
  - `remove clears the record`: `get` returns `{ lastUsedAt: null, renewedAt: null }`.
- [ ] **Step 2: Run `pnpm --filter @slice/launcher exec vitest run src/ai-connections/activity.test.ts`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `ActivityStore` in `activity.ts`.** Store JSON with ISO timestamps; `touch` skips the write when `now - lastUsedAt < 300_000` ms.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Write failing `oauth-worker.test.ts`,** modelled on `src/platform/mcp-worker.test.ts`.
  - **Fixture.** Bundle `tests/ai-connections/worker.ts` with Vite and run it in Miniflare with a KV binding. The fixture builds the provider from `oauthOptions` with:
    - a synthetic active member (subject `https://test.cloudflareaccess.com|ai-test`);
    - a test-only `/authorize` that auto-approves that member through the helpers (the real page is Task 3).
  - **Tests and assertions:**
    - `anonymous /mcp returns a Bearer challenge`:
      - status 401;
      - `WWW-Authenticate` contains `resource_metadata="<origin>/.well-known/oauth-protected-resource`;
      - that metadata has `resource === "<origin>/mcp"` and `authorization_servers` equal to `[origin]`.
    - `registers, authorizes with PKCE and lists tools`: `@modelcontextprotocol/client` completes the flow and `slice_apps` is listed.
    - `access pass expires after 7 days`: the token response has `expires_in === 604800`.
    - `refresh renews and records renewal`: after a refresh grant, `ActivityStore.get` returns a non-null `renewedAt`.
    - `use records lastUsedAt once per 5 minutes`.
    - `suspended member gets 403 on the next request`: flip status in the fixture state.
    - `identity rebinding is refused`: change the member's subject or email in state, expect 403 (Review Focus 1).
    - `Cf-Access-Jwt-Assertion alone is refused`: a signed Access JWT and no Bearer pass gives 401.
    - `pass does not contain email or subject`: neither string appears in the issued code or access token.
    - `reconnecting the same client replaces its grant`: a second approval for the same client leaves one grant in `listUserGrants`, and the old access pass gets 401.
    - `register refuses plain http redirect`: `http://evil.example/cb` gives 400; `http://127.0.0.1:5555/cb` and `https://claude.ai/cb` are accepted.
    - `register is rate limited`: the 21st registration within a minute from one IP gives 429.
    - `OAuth responses are private`: `/mcp` 401 and `/oauth/token` errors carry `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- [ ] **Step 6: Run `pnpm --filter @slice/launcher exec vitest run src/ai-connections/oauth-worker.test.ts`.** Expected: FAIL.
- [ ] **Step 7: Implement `oauth.ts`.**
  - **`apiHandler`** takes `GrantProps` from `ctx.props` and builds `{ subject, email }`. It calls `deps.mcp(request, identity)`, then `ctx.waitUntil(store.touch(await grantUserId(subject), props.grantId))` when `grantId` is set.
  - **`tokenExchangeCallback`** calls `store.renewed(userId, grantId)` and returns `{ accessTokenProps: { ...props, grantId } }`.
  - **`resourceMetadata`:** `{ resource: origin + "/mcp", authorization_servers: [origin], resource_name: "Slice" }`.
  - Use Deal Toy's per-origin provider caching.
- [ ] **Step 8: Implement `platform/worker/index.ts`.**
  1. For `POST /oauth/register` and `POST /oauth/token`, call `env.OAUTH_LIMITER.limit({ key: "<path>:" + (CF-Connecting-IP ?? "unknown") })`; refuse with 429 JSON `{ error: "rate_limited" }`.
  2. For `/oauth/register`, read the body (bounded to 16 KiB). Refuse with 400 `{ error: "invalid_redirect_uri" }` unless every `redirect_uris` entry is `https:`, or `http:` on `127.0.0.1` or `localhost`. Re-create the request for the provider.
  3. Delegate to `oauthOptions(origin, …)`'s provider. For `deps.mcp`, pass `createMcpAdapter({ catalog: apps, modules, verify: async () => identity, loadState: () => new Repository(env.MEMBERSHIP_DB).load() })(request)`.
  4. On responses for `/mcp`, `/oauth/*` and `/.well-known/oauth-*`, set `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- [ ] **Step 9: Configure Wrangler and types.** Add `OAUTH_KV` (local id placeholder documented in the PR), the `OAUTH_LIMITER` rate limit and `AI_CONNECTIONS_ENABLED: "false"` to `wrangler.jsonc`, then run `pnpm --filter @slice/launcher cf-typegen`.
- [ ] **Step 10: Update `check-architecture.mjs`.** Delete `platform/app/mcp/route.ts`. In the server-module regex, add `src/ai-connections/` files except `status.ts`, `contracts.ts` and `*.tsx`.
- [ ] **Step 11: Run the Step 6 command, then `pnpm test` and `pnpm typecheck`.** Expected: PASS. `src/platform/mcp.test.ts` and `mcp-worker.test.ts` still pass unchanged; they test the adapter, which is untouched.
- [ ] **Step 12: Commit** with the message `Serve /mcp through Slice OAuth grants`.

### Task 3: Approval page at `/authorize`

**Files:**

- Create: `platform/src/ai-connections/consent.ts`, `platform/app/authorize/route.ts`
- Test: `platform/src/ai-connections/consent.test.ts`

**Interfaces:**

- Consumes: `oauthHelpers`, `grantUserId`, `SCOPE` (Task 2); `verifyIdentity` (`src/membership/auth.ts`); `Repository`; `authorizeMember`.
- Produces: `authorize(request: Request, deps: { helpers: OAuthHelpers; identify: (request: Request) => Promise<Identity>; loadState: () => Promise<State> }): Promise<Response>`. The route handler exports `GET` and `POST`, both calling it with production deps.

- [ ] **Step 1: Write failing `consent.test.ts`.** Use fake helpers and synthetic identities.
  - `invalid request shows Cannot connect`: 400, body contains "Cannot connect".
  - `pending member gets access_denied`: redirects to the client with `error=access_denied`.
  - `suspended member gets access_denied`: same.
  - `active member sees the approval page`, which includes:
    - the escaped client name, labelled "the name this app gave itself";
    - the redirect host, with "(an app on this computer)" for loopback;
    - the account;
    - the exact approval statement;
    - Allow and Cancel buttons.
  - `page headers`:
    - `Content-Security-Policy` includes `form-action 'self' <redirect origin>`;
    - `X-Frame-Options: DENY`;
    - `Cache-Control: private, no-store`;
    - `Referrer-Policy: same-origin`.
  - `hostile name is escaped and truncated`: `<script>` plus 200 characters renders escaped and cut to 80; an empty name shows "Unnamed app" (Review Focus 5).
  - `Allow completes authorization`:
    - `completeAuthorization` is called with `userId = await grantUserId(subject)`, `scope ["slice"]` and `props { subject, email, clientId }`;
    - `metadata.clientName` is set;
    - the response is a 302 to `redirectTo`.
  - `Cancel denies`: 302 with `access_denied`.
  - `cross-site POST refused`: an `Origin` from another site gives 403.
  - `replayed or mismatched POST shows Approval expired`: a reused handle, or an `account` field different from the signed-in email, gives 400 "Approval expired" and no `completeAuthorization` call (Review Focus 2).
- [ ] **Step 2: Run `pnpm --filter @slice/launcher exec vitest run src/ai-connections/consent.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement `authorize` in `consent.ts`,** following Deal Toy's `consent.ts`: `parseAuthRequest`, `describeConsent`, `beginConsent`, `approveConsent`, `denyConsent`, `completeAuthorization`.
  - Identity comes from `deps.identify`, the Access JWT; there's no sign-in redirect, because Access already signed the person in.
  - Pages are script-free HTML with inline styles using the Slice design-profile colors and fonts.
  - Copy: titles "Connect <name> to Slice", "Cannot connect", "Approval expired", "Membership required".
- [ ] **Step 4: Run the Step 2 command.** Expected: PASS.
- [ ] **Step 5: Add `app/authorize/route.ts`** wiring production deps with `oauthHelpers(env, new URL(request.url).origin)`. Run `pnpm build`. Expected: builds.
- [ ] **Step 6: Commit** with the message `Add the Slice approval page for AI apps`.

### Task 4: Connected-apps API

**Files:**

- Create: `platform/src/ai-connections/contracts.ts`, `platform/src/ai-connections/connections.ts`
- Create: `platform/app/api/membership/connections/route.ts`, `platform/app/api/membership/connections/[id]/route.ts`
- Test: `platform/src/ai-connections/connections.test.ts`; add a Disconnect case to `oauth-worker.test.ts`

**Interfaces:**

- Consumes: `oauthHelpers`, `grantUserId`, `ActivityStore`, `REFRESH_TOKEN_TTL`.
- Produces, in `contracts.ts` (type-only, safe for client code):
  - `type Connection = { id: string; name: string; connectedAt: string; lastUsedAt: string | null; lapsesAt: string }`;
  - `type ConnectionsResponse = { enabled: boolean; connections: Connection[] }`.
- Produces, in `connections.ts`:
  - `listConnections(identity: Identity, deps: ConnectionDeps): Promise<ConnectionsResponse>`;
  - `disconnect(identity: Identity, grantId: string, deps: ConnectionDeps): Promise<void>`, which throws `MembershipError(404)` when the grant isn't the caller's;
  - `type ConnectionDeps = { helpers: OAuthHelpers; activity: ActivityStore; loadState: () => Promise<State>; enabled: boolean }`.

- [ ] **Step 1: Write failing `connections.test.ts`.**
  - `lists only the caller's grants with names and times`:
    - `name` comes from `metadata.clientName`, truncated to 80 characters, with "Unnamed app" as fallback;
    - `lapsesAt` = (`renewedAt` ?? `createdAt`) + 30 days.
  - `requires an active member`: a suspended member gets 403.
  - `reports enabled flag`: `enabled` mirrors `deps.enabled`.
  - `disconnect revokes and clears activity`: `revokeGrant(id, userId)` and `activity.remove` are called.
  - `disconnect of another member's grant is 404`.
  - Then add `disconnect stops the pass and its renewal` to `oauth-worker.test.ts`: after `revokeGrant`, the access pass gets 401 on `/mcp` and the refresh grant gets `invalid_grant` (Review Focus 3).
- [ ] **Step 2: Run both test files.** Expected: FAIL.
- [ ] **Step 3: Implement `connections.ts`.** Page `listUserGrants` with its cursor up to 50 grants, and call `authorizeMember` before reading.
- [ ] **Step 4: Add the routes.**
  - `GET /api/membership/connections` returns `json(ConnectionsResponse)`.
  - `DELETE /api/membership/connections/[id]` returns 204.
  - Both use `verifyIdentity` with the Access config, `errorResponse` for failures, and private/no-store responses.
  - `DELETE` returns 403 unless `Origin` equals the request origin.
  - `enabled` is `env.AI_CONNECTIONS_ENABLED === "true"`.
- [ ] **Step 5: Run both test files, then `pnpm typecheck`.** Expected: PASS.
- [ ] **Step 6: Commit** with the message `Add the connected-apps API`.

### Task 5: Top bar connection status

**Files:**

- Create: `platform/src/ai-connections/status.ts`, `platform/src/ai-connections/connection-status.tsx` (client component)
- Modify: `platform/app/page.tsx`, `platform/app/account/page.tsx`, `platform/app/connect-ai/page.tsx`, `platform/app/guides/[appId]/page.tsx`, `platform/app/apps/[appId]/[[...path]]/page.tsx`, `platform/app/globals.css`
- Test: `platform/src/ai-connections/status.test.ts`, `platform/src/ai-connections/connection-status.test.ts`

**Interfaces:**

- Consumes: `ConnectionsResponse` (Task 4).
- Produces:
  - `type StatusView = { kind: "connect" | "active" | "idle" | "ending"; label: string; detail: string | null; href: "/connect-ai" | "/account#connected-apps" }`;
  - `connectionStatus(response: ConnectionsResponse | null, now: Date): StatusView | null`;
  - `ConnectionStatus()`: fetches `/api/membership/connections` with `cache: "no-store"` and renders the view or nothing.

- [ ] **Step 1: Write failing `status.test.ts`.**
  - `null or disabled response hides status`: `null`.
  - `no connections shows Connect your AI`: `{ kind: "connect", href: "/connect-ai" }`.
  - `used within 7 days is active`: label "AI connected", detail "Claude · used 5 min ago".
  - `unused 7+ days is idle`: "AI connected · idle".
  - `lapsing within 3 days warns`: "AI sign-in ends in 2 days"; "AI sign-in ends in 1 day".
  - `several apps show the most recent plus count`: detail ends with " +1".
  - `relative times`: "just now" under 1 minute, "N min ago", "N hr ago", "N days ago".
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `connectionStatus`.** The most recently used connection (by `lastUsedAt`, falling back to `connectedAt`) decides the state. "Ends soon" takes precedence over active or idle.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Write failing `connection-status.test.ts`.** Render with a mocked `fetch`.
  - `renders nothing when the request fails or returns 403`.
  - `renders label, detail and an accessible name, not color alone`: the link's accessible name contains the label text.
  - Review Focus 4: also cover a rejected `fetch` and a 10-second timeout via `AbortSignal.timeout`.
- [ ] **Step 6: Implement `ConnectionStatus` and add it to every page header next to the account link.**
  - Placement: left of `AccountNav` on the launcher and guides, and left of the "Applications" link on account and Connect your AI. On app pages, add it beside "My account".
  - CSS: a status dot plus text. Below 640px, show the dot and label only and hide the detail.
- [ ] **Step 7: Run `pnpm test`, `pnpm lint` and `pnpm test:e2e`.** Expected: PASS, with existing header e2e assertions unchanged because status is hidden when disabled.
- [ ] **Step 8: Commit** with the message `Show AI connection status in the top bar`.

### Task 6: Connected apps on the account page

**Files:**

- Create: `platform/src/ai-connections/connected-apps.tsx` (client component)
- Modify: `platform/src/membership/workspace.tsx` (Profile tab, below `ProfileEditor`), `platform/app/globals.css`
- Test: `platform/src/ai-connections/connected-apps.test.ts`

**Interfaces:**

- Consumes: `ConnectionsResponse`, `Connection` (Task 4); `DELETE /api/membership/connections/:id`.
- Produces: `ConnectedApps()`, a section with `id="connected-apps"` and heading "Connected apps". It renders nothing when `enabled` is false or the request fails.

- [ ] **Step 1: Write failing tests with `renderToStaticMarkup` and a mocked `fetch`.**
  - `lists apps with connected, last used and lapse dates`.
  - `empty state links to Connect your AI`: "No connected apps." and `href="/connect-ai"`.
  - `shows the exact explanation copy`.
  - `escapes a hostile name` (Review Focus 5).
  - `Disconnect asks for confirmation, then sends DELETE and reloads`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `ConnectedApps`.**
  - Use Deal Toy's table layout and Slice's `account-card` styles.
  - The confirmation reads "Disconnect <name>? It stops working at once."
  - "Last used" shows "Never" when null.
- [ ] **Step 4: Run it, then `pnpm test:e2e`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `Manage connected apps from the account page`.

### Task 7: Release checks

**Files:**

- Modify: `scripts/check-launcher.mjs`, `scripts/smoke-launcher.mjs` if needed
- Test: `scripts/check-launcher.test.mjs`

**Interfaces:**

- Consumes: the `/mcp` challenge and metadata behavior from Task 2.
- Produces: `checkMcpDenied(baseUrl, options)` and `checkAccessBoundary(baseUrl, accessDomain)`, with the new rules below.

- [ ] **Step 1: Write failing tests in `check-launcher.test.mjs`.**
  - `checkMcpDenied accepts the Slice challenge`: 401, JSON, no-store, and `WWW-Authenticate` with `resource_metadata` on the same origin under `/.well-known/oauth-protected-resource`.
  - `checkAccessBoundary accepts /mcp as an Access redirect or a Slice challenge`. For the challenge, metadata `authorization_servers` must equal `[baseUrl origin]` and `resource` must equal `<origin>/mcp`.
  - `checkAccessBoundary still requires an Access redirect for / and /api/membership`.
  - `rejects a challenge whose metadata points to another origin`.
- [ ] **Step 2: Run `node --test scripts/check-launcher.test.mjs`.** Expected: FAIL.
- [ ] **Step 3: Update the checks.** Keep accepting the old Access managed-OAuth metadata path for `/mcp`, so verified rollback targets still pass. An Access redirect stays valid for `/mcp` until the bypass is added in production.
- [ ] **Step 4: Run the test, `pnpm build` and `pnpm smoke:launcher`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `Check the Slice OAuth challenge after deploys`.

### Task 8: Connect your AI and documentation

**Files:**

- Modify: `platform/app/connect-ai/page.tsx`, `platform/src/connect-ai/instructions.ts`, `docs/connect-your-ai.md`, `docs/mcp.md`, `docs/architecture.md`, `docs/membership.md`, `docs/security-review.md`, `docs/data-boundary.md`, `AGENTS.md`, `README.md` if it describes MCP sign-in
- Test: existing Connect your AI tests or e2e, updated for new copy

**Interfaces:**

- Consumes: everything above. No new code interfaces.

- [ ] **Step 1: Update the Connect your AI steps to the spec's four steps.**
  - Keep the "awaiting setup" notice. Show it whenever `AI_CONNECTIONS_ENABLED !== "true"`.
  - Add verified Claude and ChatGPT connector steps from their current official docs, recording the docs' dates in the PR. Do not invent menu names.
- [ ] **Step 2: Rewrite `docs/mcp.md` "Activate remote sign-in" as the spec's activation steps.**
  - Steps: KV and rate limit creation, deploy with the flag off, the narrow Access bypass, the production check list, then turning on `AI_CONNECTIONS_ENABLED`, with rollback.
  - Update the identity diagram to `Client → Slice OAuth → /mcp`.
- [ ] **Step 3: Update the other documents.**
  - `architecture.md`: the diagram and the `/mcp` paragraph.
  - `membership.md`: the "Remote MCP clients" section.
  - `security-review.md`: the new trust boundary, covering the bypassed paths, open registration with the approval page, KV storage and rate limits.
  - `data-boundary.md`, `AGENTS.md` and `mcp.md`: approved AI apps become guidance, not enforcement.
  - `AGENTS.md`: the bypassed paths must keep validating Slice passes.
- [ ] **Step 4: Run `pnpm format:check` and the full gate from Global Constraints.** Expected: all pass.
- [ ] **Step 5: Take desktop and mobile screenshots** of the approval page, the top bar in each state (with the flag on in local dev) and Connected apps. Run an axe check on each and attach the screenshots to the PR.
- [ ] **Step 6: Commit** with the message `Document Slice OAuth for AI apps`.
- [ ] **Step 7: Push `feat/ai-connections` and open the PR** using the template. Under deployment impact, list the new bindings, the Access bypass and the activation order. Report it as pushed and awaiting review; do not deploy.
