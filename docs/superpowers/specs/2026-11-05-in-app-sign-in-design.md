# In-app sign-in: replace Cloudflare Access with Slice's own Google sign-in

Status: **decided by Ivan on November 5, 2026** ("just switch to in app access now"). This is the design the implementation follows.

## Why

Slice currently has two sign-in systems:

- Cloudflare Access (Google sign-in at Cloudflare's edge) for people in a browser;
- Slice's own OAuth for AI apps (PR #61).

AI sign-in needs Access to exempt five paths. Cloudflare's documentation does not confirm that path-only exemptions work on a `workers.dev` address, and Cloudflare Zero Trust becomes a per-user cost beyond its free tier. Ivan chose Deal Toy's model instead: Slice runs Google sign-in and its own sessions, and Access comes off the site. One sign-in system then covers people and AI apps, and all of its configuration lives in Git.

## Decisions

- **Sign-in.** "Sign in with Google" in the app, using Google OAuth 2.0 with PKCE, `state` and `nonce`. The callback verifies the ID token's signature against Google's keys, plus issuer, audience, expiry and nonce, and requires `email_verified`. This copies Deal Toy's `src/server/google.ts`.
- **Who may sign in.** Any Google account with a verified email (revised by Ivan on November 5, 2026: "Sign ins will be controlled through the app"). Membership approval is the gate: new people are pending until an administrator approves them. Claims made by email alone (an invitation, the unclaimed owner seat, or re-linking a legacy member) need an address Google manages: `@gmail.com`, or an ID token whose hosted-domain claim (`hd`) equals the address's domain. Otherwise Google verified the address only when the account was created, so sign-in is refused when it would claim one of those.
- **Identity.** `Identity` stays `{ subject, email }`. The new subject is `https://accounts.google.com|<Google sub>`. Everything downstream (`authorizeMember`, enrollment, permissions, MCP grants) keeps working unchanged.
- **Existing members.** They are linked to their old Access subject (`https://snowy-voice-36a1.cloudflareaccess.com|…`). On their first Google sign-in, a member whose email matches and whose subject still has that legacy prefix is re-linked to the Google subject once, with an audit record. A member already on a Google subject is never re-linked by email, so another Google account cannot take them over.
- **Sessions.**
  - A random 32-byte token in a `__Host-slice_session` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`).
  - Stored only as a SHA-256 hash in a new D1 `sessions` table, with subject, email, created, expires, last seen and user agent.
  - Valid for 30 days, sliding (renewed at most hourly while in use).
  - Every request reloads current membership, as today.
- **Sign-out.** `POST /api/auth/logout` deletes the session and clears the cookie, replacing `/cdn-cgi/access/logout`.
- **Rate limits.** Google start and callback are limited per address by a new `AUTH_LIMITER` binding (20 a minute).
- **Approval page.** `/authorize` uses the session. Without one, it sends the person to Google sign-in and back to the same `/authorize?…` address. The return path accepts only `/authorize?…`, so it cannot become an open redirect.
- **Writes stay protected.** Same-origin JSON writes and `SameSite=Lax` cookies.
- **AI sign-in.** No change. The five OAuth paths no longer need any Access exemption, because Access is removed entirely.
- **CI and post-deploy checks.**
  - They run anonymously: `/` serves the launcher shell, `/api/membership` returns 401 JSON, and `/mcp` returns Slice's OAuth challenge.
  - The Access service token (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`) and `ACCESS_TEAM_DOMAIN` checks are removed from the workflows.
- **Test harnesses.** The browser (e2e) and team harnesses keep their synthetic signed-identity stand-in for "a signed-in person". They test membership behavior, not the sign-in mechanism. Sign-in itself is covered by unit and Worker tests of the Google callback and sessions.

## Configuration

| Name                               | Kind       | Value                                                                                               |
| ---------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`                 | var        | From the Google OAuth client the maintainer creates                                                 |
| `GOOGLE_CLIENT_SECRET`             | secret     | Set with `wrangler secret put`; never in Git                                                        |
| `LEGACY_ACCESS_ISSUER`             | var        | `https://snowy-voice-36a1.cloudflareaccess.com`, used only to recognize old subjects for re-linking |
| `AUTH_LIMITER`                     | rate limit | 20 per 60 s                                                                                         |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | removed    | No longer used                                                                                      |

The Google OAuth client's authorized redirect URI is `https://slice-launcher.ivan27chen.workers.dev/api/auth/google/callback`. Missing Google configuration makes sign-in fail closed with a clear message.

## Cutover (maintainer authorization at each step)

1. **Create the Google OAuth client.** Use a Web application client with the redirect URI above. Put the client ID in `wrangler.jsonc` and set the secret.
2. **Merge and release.** Access is still in front, so people pass Access and then sign in with Google once.
3. **Turn off Access for the Worker.** In Workers & Pages → slice-launcher → Settings → Domains & Routes → workers.dev, disable Cloudflare Access. The Access application can then be deleted.
4. **Verify.**
   - Owner sign-in re-links the owner's account.
   - A second member signs in.
   - A pending person stays pending.
   - Sign-out works.
   - Claude connects through `/authorize`.
   - The post-deploy checks pass.

**Rollback.** Before step 3, revert the code. After step 3, re-enable Access and roll back. Older releases expect Access identities, so they fail closed without Access. Re-linked members keep their Google subject; a rollback after re-linking would need those subjects restored from the audit records, so avoid rolling back past step 4 without a plan.

## Not in scope

- Email or password sign-in, magic links, API keys.
- Admin "sign out everywhere".
- Other identity providers.
