# AI connections: Slice sign-in, connection status and connected apps

Status: **proposed design**, not approved for implementation. Written November 5, 2026.

## Why

Consultants are meant to connect their own AI app, such as ChatGPT or Claude, to Slice's MCP server at `/mcp`. The current design hands that sign-in to Cloudflare Access managed OAuth. It has never been switched on in production.

With managed OAuth, Cloudflare keeps the record of which AI apps a person connected, not Slice. Cloudflare's documentation offers no way for the site to list one person's connected apps, show when one was last used, or disconnect just one; the only lever is signing the person out of everything. That rules out what consultants need:

- a visible sign that their AI is connected and working;
- a list of the AI apps they've connected, with a way to disconnect each one.

Deal Toy (the Mantel app in `UnitedAI-Projects/deal-toy`) already solves this. It runs its own sign-in for AI apps inside its Worker with Cloudflare's `@cloudflare/workers-oauth-provider` library, and its Settings page lists and disconnects connected apps. Slice copies that approach for AI sign-in and keeps Cloudflare Access for people using the launcher in a browser.

### What success looks like

- A consultant adds Slice's address in Claude or ChatGPT and signs in. They approve one Slice page that names the app, then see **AI connected** in the launcher's top bar.
- They open their account and see that app, when it was connected, when it last used Slice and when its sign-in lapses. **Disconnect** stops it immediately.
- A suspended member's connected AI stops working on its next request, without anyone touching Cloudflare.

## Decisions made by Ivan

From the November 5, 2026 conversation:

1. **Copy Deal Toy's approach.** Slice runs its own sign-in for AI apps with `@cloudflare/workers-oauth-provider`.
2. **Cloudflare Access is not used for AI sign-in.** Managed OAuth is dropped. Access **stays** in front of the launcher pages for people in a browser.
3. **Time-limited sign-in, as in Deal Toy.**
   - The AI app's pass lasts **7 days** and renews quietly.
   - Renewal stops once the AI app has gone **30 days** without renewing, and the person signs in again.
4. **Connection status in the launcher's top bar.**
5. **A place in the profile (account page) to manage connected apps**, with disconnect.
6. **The workflow for connecting an agent** is part of this work: the **Connect your AI** page and its guide.

## Goals

- **Standard sign-in:** `/mcp` supports the MCP authorization standard, served by Slice:
  - OAuth 2.1 with PKCE;
  - protected-resource metadata (RFC 9728) and authorization-server metadata (RFC 8414);
  - dynamic client registration (RFC 7591).
- **Discovery:** an AI app with no pass gets a 401 from `/mcp` whose `WWW-Authenticate` header points to the metadata.
- **Approval:** the person approves each AI app on a Slice page, which knows who they are from their existing Access sign-in. There is no extra login step.
- **Same access as the person:** a connected AI acts as that member with their **current** access. Membership and permissions are reloaded on every request, as today.
- **Status and management:**
  - every launcher page shows connection status;
  - the account page lists connected apps with last use, sign-in lapse and **Disconnect**.
- **Clear setup:** **Connect your AI** walks a consultant through connecting and checking it worked.

## Non-goals

- **Browser sign-in stays as it is.** Cloudflare Access continues to protect launcher pages and browser APIs.
- **No API keys.** Deal Toy also accepts API keys for scripts; Slice does not add them (my call).
- **No admin view of other members' connections** in this release. An administrator who suspends or revokes a member still cuts off that member's AI immediately, because access is rechecked on every request.
- **No new permission model.** One scope, `slice`. A connected AI has exactly the member's access, nothing more or less.
- **No OAuth for browser APIs.** Passes work on `/mcp` only, not `/api/*`.

## Anti-goals (would count as failure even if it works)

- Anyone reaching Slice's tools without an active Slice membership, or past a suspension.
- An AI app connecting without the person seeing which app it is and where it returns to. That is the phishing path open registration creates.
- A member's email or Access subject appearing in passes, URLs or AI app logs.
- Hand-written OAuth, PKCE or token handling where the maintained library provides it.
- A broad Cloudflare Access bypass. Only the exact AI sign-in paths below may skip Access.

## How it works

### Who handles which path

| Path                                                                                | Behind Cloudflare Access?                   | Handled by                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| Launcher pages and `/api/*`                                                         | Yes, as today                               | Existing app code                                                |
| `/authorize` (approval page)                                                        | **Yes**, so the page knows who is signed in | New Slice approval page                                          |
| `/mcp`                                                                              | **No**                                      | OAuth library checks Slice's pass, then the existing MCP adapter |
| `/oauth/token`, `/oauth/register`                                                   | **No**                                      | OAuth library                                                    |
| `/.well-known/oauth-protected-resource…`, `/.well-known/oauth-authorization-server` | **No**                                      | OAuth library                                                    |

The four bypassed paths are protected by Slice's own passes. They never accept a Cloudflare Access identity in place of one. The bypass is a narrow, path-specific Access rule; everything else keeps today's Access application unchanged.

### Library and Worker entry

- `@cloudflare/workers-oauth-provider` wraps the Worker, as in Deal Toy's `src/server/oauth.ts`:
  - `apiRoute: "/mcp"`, with the MCP handler as `apiHandler`;
  - vinext's fetch handler as `defaultHandler`, so every other request reaches the app unchanged;
  - `authorizeEndpoint: "/authorize"`, `tokenEndpoint: "/oauth/token"`, `clientRegistrationEndpoint: "/oauth/register"`;
  - one scope, `slice`.
- Grants and passes are stored hashed in a new Workers KV namespace, `OAUTH_KV`.
- Slice's `wrangler.jsonc` currently points `main` at `vinext/server/fetch-handler`. **First implementation task:** confirm vinext supports a custom Worker entry that wraps its handler, and that local development and the release build still work. If it doesn't, the fallback is route handlers for the OAuth paths using the library's `getOAuthApi` helpers. That fallback must not reimplement token validation by hand. Stop and report if neither works cleanly.
- Route handlers such as the approval page and the connected-apps API reach the library through `getOAuthApi(options, env)`, so helpers work outside the wrapper's own dispatch.

### `/mcp`

1. The library rejects requests without a valid Slice pass, returning 401 with `WWW-Authenticate`.
2. With a valid pass, it hands the handler the grant's props: the member's Access `subject` and `email`, captured at approval.
3. The handler builds the same `Identity` the browser path uses and calls the existing MCP adapter. Only the identity source changes: props instead of the `Cf-Access-Jwt-Assertion` header.
4. The adapter reloads membership and calls `authorizeMember`, which requires the subject, the email and active status to still match. So:
   - suspension, revocation and permission changes apply on the next request;
   - a pass for a member whose email or identity binding changed stops working.
5. Existing limits stay: the cross-site `Origin` check, the 16 KiB request limit, private/no-store responses and generic errors.
6. `/mcp` no longer accepts Access identities at all.

### Approval page (`/authorize`)

1. **GET:** the library parses the AI app's request. Invalid requests show an error, or redirect back with an error where the library says to.
2. **Identity check:** Slice verifies the Access identity exactly as for any protected page and loads membership. If the person has no Access session, Access signs them in first and returns them to the same `/authorize` address.
   - Pending, invited or suspended members see an explanation, and the AI app receives `access_denied`.
   - Active members continue.
3. **Approval screen**, server-rendered in Slice's design. It shows:
   - the AI app's name;
   - the address it will return to (host, with "an app on this computer" for loopback addresses);
   - the person's account;
   - the statement "This app will be able to use Slice as you, with your current access."

   The buttons are **Allow** and **Cancel**.

4. **POST:** must be same-origin, and is bound to the browser by the library's consent handle.
   - **Allow** calls `completeAuthorization` with:
     - `userId`: a digest of the Access subject. The library puts the user ID in plain text at the front of codes and passes, and the subject contains `:`, which `userId` forbids;
     - `props`: `{ subject, email }`;
     - `scope`: `["slice"]`;
     - the client name in `metadata`.
   - **Cancel** returns `access_denied`.
5. If a Content Security Policy applies to this page, its `form-action` must allow the redirect back to the AI app after **Allow** (Deal Toy hit this).
6. The person is asked once for each AI app registration. Reconnecting the same app replaces its earlier grant (the library's default `revokeExistingGrants`).

### Passes, renewal and last use

- **Lifetimes:** 7-day access passes; rotating renewal passes that lapse after 30 days without renewal. These match Deal Toy's constants.
- **Renewal tracking:** the library's `tokenExchangeCallback` runs on each initial exchange and renewal. Slice records the time against the grant to show when the sign-in lapses (last renewal + 30 days).
- **Last use:** the `/mcp` handler records the time against the grant, at most once every 5 minutes per grant and after the response via `waitUntil`, to show "used 5 min ago".
- **Storage:** both records go in `OAUTH_KV` under a Slice-owned prefix (my call; it avoids a D1 migration). They are deleted when the grant is revoked.

### Connected-apps API

Browser-only, behind Access, using the existing membership identity checks. Responses are private/no-store.

- `GET /api/membership/connections` lists the current member's grants:
  - id and app name;
  - connected at and last used at;
  - sign-in lapses at.
- `DELETE /api/membership/connections/:id` calls `revokeGrant` for that member's grant only. It requires a same-origin request and returns 404 for another member's grant.

### Top bar status

A shared `ConnectionStatus` component sits next to the account link in every page's header: launcher, account, Connect your AI, guides and app pages.

| State                         | Shows                                                                               | Links to                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| No connected apps             | **Connect your AI**                                                                 | `/connect-ai`                                               |
| Used in the last 7 days       | **AI connected** with a status dot, and "Claude · used 5 min ago" as secondary text | Connected apps on `/account`                                |
| Connected, unused for 7+ days | **AI connected · idle**                                                             | Connected apps                                              |
| Sign-in lapses within 3 days  | **AI sign-in ends in 2 days**                                                       | Connected apps (how to renew: use the AI app, or reconnect) |

- **Several apps:** the most recently used one is shown, with "+1" for others.
- **Hidden:** for pending, suspended and signed-out members, and if the connections request fails. The header must still render.
- **Accessibility:** status is never conveyed by color alone. Text labels and an accessible name are required. On narrow screens it collapses to the dot and a short label without crowding the account link.
- **Before production sign-in is verified:** the status stays hidden and **Connect your AI** keeps its "awaiting setup" notice. A deployment variable, `AI_CONNECTIONS_ENABLED`, defaults to off.

### Account page: connected apps

A **Connected apps** section on `/account`, modelled on Deal Toy's:

- **Table columns:** app name, connected date, last used, sign-in lapses on, **Disconnect**.
- **Disconnect:** asks for confirmation, then revokes the app, which stops it immediately.
- **Explanation:** "Apps you allowed through sign-in. They act as you, with your current access. Disconnecting one stops it at once."
- **Empty state:** "No connected apps," with a link to **Connect your AI**.

### Connect your AI

Update `platform/app/connect-ai/page.tsx` and `docs/connect-your-ai.md` for Slice's own sign-in:

1. Check your Slice account is active.
2. In your AI app, add a connector with the address `https://<launcher>/mcp`.
3. Sign in when the AI app opens a browser. You'll see Slice's approval page naming the app. Choose **Allow**.
4. Back in the launcher, the top bar shows **AI connected**. Ask your AI to list your Slice apps.

- **Client-specific steps:** ChatGPT, Claude and other clients each get verified steps at implementation time. Do not invent menu names.
- **"Awaiting setup" notice:** removed only after the production check below passes.

### Which AI apps may register

Open registration plus a clear approval page is Deal Toy's model. Slice's rules ask consultants to use approved AI clients. The design therefore allows registration only for redirect addresses that are:

- on a configurable allowlist of HTTPS hosts, initially Claude and ChatGPT's published connector callbacks; or
- loopback (`127.0.0.1`, `localhost`), for desktop and command-line clients.

Registration and the token endpoint are rate-limited per IP with a Workers rate limiting binding. See open question 1.

## Documentation to update

- `docs/mcp.md`: replace "Activate remote sign-in" (managed OAuth) with this design's activation steps. Update the identity diagram and description.
- `docs/architecture.md`: the request-path diagram shows `Client → Slice OAuth` instead of Access managed OAuth.
- `docs/membership.md` ("Remote MCP clients") and `docs/connect-your-ai.md`.
- `AGENTS.md`: the MCP bullet still holds (the host owns `/mcp` and identity). Add that `/mcp` and the OAuth endpoints are the only Access-bypassed paths and must keep validating Slice passes.
- `docs/security-review.md`: record the new trust boundary.

## Deployment and production activation

These need maintainer authorization at the time, as `AGENTS.md` requires. Approving this design does not authorize them.

- **New resources:** an `OAUTH_KV` namespace and a rate limiting binding, created in Cloudflare and bound in `wrangler.jsonc`. No D1 migration.
- **Release order:**
  1. Deploy the code first, with `AI_CONNECTIONS_ENABLED` off. While Access still fronts `/mcp`, AI apps can't connect yet, so nothing visible changes.
  2. Then add the narrow Access bypass for the four AI sign-in paths, saving the current Access configuration for rollback.
  3. Leave managed OAuth disabled.
- **Production check:**
  1. Anonymous `/mcp` returns 401 with `WWW-Authenticate`, and the metadata is reachable without Access.
  2. Connect Claude and ChatGPT, list tools and call `slice_apps`.
  3. Turn on `AI_CONNECTIONS_ENABLED`, then confirm the top bar and account list.
  4. Disconnect and confirm the AI loses access.
  5. Suspend a test member and confirm their AI stops.
  6. Confirm browser sign-in and the release smoke checks still pass.

  Record the client versions tested.

- **Post-deploy checks:** the forward check currently expects the CI service identity to get 401 from `/mcp`. It changes to expect an anonymous 401 with `WWW-Authenticate`, plus metadata JSON.
- **Rollback:** removing the Access bypass makes `/mcp` fail closed. A code rollback to a release that expects Access identities on `/mcp` also fails closed, since bypassed requests carry no Access identity. Neither exposes tools.

## Testing

Use the existing Vitest and workerd setup with a KV binding, synthetic identities and isolated D1:

- **Discovery:** metadata documents and the 401 `WWW-Authenticate` challenge.
- **Registration:** allowed and refused redirect addresses; the rate limit.
- **Approval:**
  - requires a valid Access identity and active membership;
  - pending and suspended members get `access_denied`;
  - Cancel returns `access_denied`;
  - a cross-site POST is refused.
- **Sign-in and use:**
  - code-for-pass exchange with PKCE;
  - a pass works on `/mcp` and not on `/api/*`;
  - tool visibility matches the member's permissions;
  - a pass expires after 7 days and renews;
  - renewal lapses after 30 idle days.
- **Revocation:** suspension, permission revocation and identity rebinding stop an existing pass on the next request.
- **Identity source:** `/mcp` ignores `Cf-Access-Jwt-Assertion` and rejects service identities.
- **Connected apps:**
  - list shows only the caller's grants;
  - delete revokes and the pass stops working;
  - another member's grant ID returns 404.
- **Privacy:** last-use recording is throttled; no email or subject appears in issued codes or passes.
- **UI:**
  - each top bar state, with the header still rendering when the status request fails;
  - keyboard and screen-reader labels;
  - mobile layout;
  - screenshots.

## Left to the builder

- Module layout. Keep OAuth wiring, approval page, connection records and UI in separately testable modules.
- Exact copy, within the [design profile](../../design-profile.md) and the README's plain tone.
- How `OAUTH_KV` is provided in local development and tests.
- The exact allowlisted callback hosts, verified from each client's current documentation.

## Calls made in this document, not by Ivan

- No API keys for scripts.
- No admin view of other members' connections.
- `userId` is a digest of the Access subject. Props carry subject and email.
- Last-use and renewal times are stored in `OAUTH_KV` rather than D1, so no migration is needed.
- Top bar thresholds: "idle" after 7 days unused; the "ends soon" warning 3 days before the sign-in lapses.
- Status stays hidden behind `AI_CONNECTIONS_ENABLED` until production sign-in is verified.
- Reconnecting the same AI app replaces its earlier connection.

## Open questions for Ivan

1. **Which AI apps may connect?** The design allows only Claude and ChatGPT (plus desktop and command-line apps on the person's own computer), matching "use approved AI clients". The alternative is any MCP-capable app, with the approval page as the only safeguard, as in Deal Toy.
