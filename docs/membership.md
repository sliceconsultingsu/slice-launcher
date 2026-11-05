# Membership administration

Slice's own Google sign-in proves who signed in: only verified accounts in the allowed domain (`g.syr.edu`), held in a 30-day Slice session cookie. The launcher's private D1 database determines what that person can do. This release supports one organization, Slice Consulting.

## Member workflow

- A person signs in with a verified email and selects **Continue** to create their profile. Unknown people are **Pending approval**, with access only to their own profile.
- An administrator selects **Organization → Members**, chooses the person, assigns an access level, and changes their status to **Active**.
- Alternatively, an administrator uses **Add member** with an email and access level. The person is **Invited** until they sign in with that exact email. Share the app URL yourself; this release does not send invitation emails.
- **Access levels** groups permissions under names your team chooses. Every member has one base level. Editing a level affects all members assigned to it.
- A member can also have individual **Allow** and **Revoke** permissions. Revoke wins over both base permissions and individual allows.
- **Suspended** members retain their profile record but receive no organization permissions. Server checks use current database state on every request; an old sign-in token does not restore access.
- Owners have all permissions. Only owners can grant ownership, change owners, or change their own access. At least one active owner must remain.
- Delegated administrators cannot grant permissions they do not hold or modify members whose effective access exceeds their own. They cannot edit their own base access level.
- **Activity** records membership and level changes. Only members with `audit.read` may see these records, which contain personal information.

## Organization role versus base access level

The account shows the effective **organization role**, separate from the **base access level** in the member editor. An active owner appears as **Admin (owner)**. Ownership grants all permissions, regardless of whether the base level is named Member. The initial owner was intentionally bootstrapped with that base level; that name never limited owner authority.

An ordinary active Member has only `members.read` by default: they can browse the limited directory, but cannot manage members, change levels or see activity. Explicit permissions can grant additional access. A member with `members.manage` or `levels.manage` appears as **Admin**, while an audit-only delegate appears as **Activity reviewer**. The label describes effective access; it does not grant it. Custom level names are not security roles, and renaming a level does not change its permissions. Pending/suspended members have no organization access.

If an account unexpectedly has administrative access, inspect its ownership flag, base level permissions and individual Allow/Revoke settings. Do not infer authority from the level name alone. Server checks remain authoritative; hiding a button is insufficient. Changing these labels does not promote accounts or modify production membership data.

## Production activation checklist

Sign-in is Slice's own Google sign-in (design: [in-app sign-in](superpowers/specs/2026-11-05-in-app-sign-in-design.md)). It replaced Cloudflare Access on November 5, 2026. Each step below changes production and needs maintainer authorization.

1. **Google OAuth client.** In Google Cloud, create a Web application OAuth client with the authorized redirect URI `https://slice-launcher.ivan27chen.workers.dev/api/auth/google/callback`. Put its client ID in `GOOGLE_CLIENT_ID` in `platform/wrangler.jsonc` through a reviewed PR. Set the secret yourself with `pnpm --filter @slice/launcher exec wrangler secret put GOOGLE_CLIENT_SECRET`, never in Git or chat. Until both exist, sign-in fails closed with "Sign-in is not set up yet".
2. **Database.** Apply migrations to the private `slice-membership` database: `pnpm --filter @slice/launcher exec wrangler d1 migrations apply slice-membership --remote`. `0002_sessions.sql` adds the `sessions` table. Check the target account before confirming.
3. **Initial owner (new environments only).** Set the singleton organization's `owner_email` to the confirmed, normalized email with a private operator SQL file and `wrangler d1 execute`. Guard it with `owner_claimed = 0` and an empty members table. Never derive ownership from whoever visits first, and keep real emails and that SQL out of Git.
4. **Release.** Deploy through the normal pull-request gate. The post-deploy check accepts both the Access redirect and in-app sign-in, so this works before and after Access is switched off.
5. **Switch off Cloudflare Access.** In Workers & Pages → slice-launcher → Settings → Domains & Routes → `workers.dev`, disable Cloudflare Access, then delete the Access application. Existing members are moved from their old Access identity (`LEGACY_ACCESS_ISSUER`) to their Google identity on their first Google sign-in, with an audit record.
6. **Verify with real accounts.**
   - The owner signs in and keeps owner access.
   - A second existing member signs in and keeps their access.
   - A new person starts pending.
   - A non-`g.syr.edu` account is refused.
   - Approval, revocation, suspension with an existing session, and Sign out all work.
   - Direct API requests without a session are denied.
   - Do not claim activation from synthetic tests.

**Retire Access leftovers afterwards.** Once Access is off, a follow-up PR removes the `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` secrets from the workflows and the Access branches of `scripts/check-launcher.mjs`. Revoke the `slice-launcher-ci` service token in Cloudflare.

**Rollback.** Before step 5, revert the code. After step 5, re-enable Access before rolling back to a release that expects Access identities; those releases fail closed without it. Members already moved to Google identities would need their previous subjects restored from the audit history.

The D1 database ID and application code may be public. Member records, session tokens, the Google client secret and operator bootstrap data must remain private.

## Local verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm smoke:launcher`. Integration tests create disposable Miniflare D1 databases and synthetic signed identities. They exercise pending enrollment, invitations, approval, directory privacy, stale writes, audit rollback, suspension, wrong-audience tokens, forged tokens, service tokens, request size, and same-origin writes.

For local Wrangler storage, run `pnpm --filter @slice/launcher exec wrangler d1 migrations apply slice-membership --local`. Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, sign-in fails closed with a clear message; there is no development identity shortcut. The deployed route has no unsigned test-user header or first-visitor owner mode.

## Future apps and recovery

Registering a module in `platform/apps/<id>/app.json` creates an `app.<id>.open` capability plus its declared action permissions. The platform verifies identity, loads current D1 membership, and checks that capability before invoking either an app page or API. Apps use the existing Access session, origin, membership administration and deployment. Action-specific rules use `context.requirePermission("records.edit")` for declared actions. Membership is reloaded on every request; pages are dynamic and API responses are private/no-store. Applications must still validate their own domain data and enforce resource ownership.

New apps are not automatically accessible to ordinary members: an owner or authorized administrator grants access through a level or individual permission. Active owners receive all registered capabilities. Pending and suspended members cannot enter apps. The alumni application has not yet been implemented.

Email/identity changes and loss of the last owner's sign-in require an operator recovery procedure with verified identity and an audit record. The normal UI does not let members rebind their identities. Changes use a global revision: if someone else saves first, reload and reapply your intended edit. This prevents a stale screen from overwriting a newer suspension or access change.

## Remote MCP clients

Consultants using the shared `/mcp` endpoint connect through Slice's own OAuth sign-in: their AI app opens the `/authorize` approval page, which uses their Slice session (signing in with Google first if needed), and they choose **Allow**. The grant carries their Access subject and email, so every request reloads current D1 membership. Suspending or revoking a member stops their connected apps on the next request, and members can disconnect apps under **Connected apps** on their account page; no separate MCP role database or shared service login exists. Tools require app access plus their declared action, and calls recheck permissions immediately before dispatch. MCP does not enroll a new member; use the browser account/approval flow first. See [MCP setup and tool contracts](mcp.md).
