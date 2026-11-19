# Membership administration

Slice's own Google sign-in proves who signed in: any Google account with a verified email, held in a 30-day Slice session cookie. A session lasts 30 days from sign-in and is not extended by use, on the server as well as in the browser. **Sign out** ends the session on this browser; **Sign out everywhere** ends the person's sessions on every browser and device. Expired sessions are deleted from the database the next time anyone signs in. Signing in grants nothing by itself: new people are pending until an administrator approves them. An invitation, the owner seat or an existing member's record is claimed by email only when Google manages the address (a Gmail address, or a Workspace account whose hosted domain matches the address); otherwise sign-in is refused with a message to use the invited account. The launcher's private D1 database determines what that person can do. This release supports one organization, Slice Consulting.

## Member workflow

- A person signs in with a verified email and selects **Continue** to create their profile. Unknown people are **Pending approval**, with access only to their own profile.
- An administrator selects **Organization → Members**, chooses the person, assigns an access level, and changes their status to **Active**.
- Alternatively, an administrator uses **Add member** with an email and access level. The person is **Invited** until they sign in with that exact email. Share the app URL yourself; this release does not send invitation emails.
- **Access levels** groups organization permissions (viewing the directory, managing members, editing levels, viewing activity) under names your team chooses. App access is not set here; see [App access](#app-access). Every member has one base level. Editing a level affects all members assigned to it.
- A member can also have individual **Allow** and **Revoke** organization permissions. Revoke wins over both base permissions and individual allows.
- **Suspended** members retain their profile record but receive no organization permissions. Server checks use current database state on every request; an old sign-in token does not restore access. Suspending someone, or returning a member to Pending, also signs them out of their browsers and disconnects the AI apps they approved, so neither comes back if they are reinstated: they sign in and connect again. The suspension is saved first. If disconnecting their apps then fails, the screen says so; save the member again to retry.
- **Remove member** deletes a person's record, signs them out of their browsers and disconnects the AI apps they approved. Their apps are disconnected first; if that fails, the person is not removed and the screen says to try again. It is for clearing out people who should not be listed, such as someone who asked to join by mistake. It is not a ban: anyone with a Google account can ask to join again and will be Pending. To keep someone out, use **Suspended**. Nobody can remove themselves, only an owner can remove an owner, and a delegated administrator cannot remove someone whose access exceeds their own. The removal and the removed record are kept in **Activity**. AI apps the person connected stop working on their next request, because every request reloads membership; their stored connections are not deleted and lapse on their own.
- Owners have all permissions. Only owners can grant ownership, change owners, or change their own access. At least one active owner must remain.
- Delegated administrators cannot grant permissions they do not hold or modify members whose effective access exceeds their own. That comparison counts organization permissions only, so an administrator can suspend or remove someone who runs, or was added to, an app the administrator is not in. They cannot edit their own base access level.
- **Activity** records membership and level changes. Only members with `audit.read` may see these records, which contain personal information. The Activity tab shows 50 entries at a time, newest first, with **Show older activity** for the rest. People's edits to their own profile are recorded too but left out of the list unless **Include profile edits** is ticked, so they cannot crowd out administrative changes.
- **Limits on changes.** One person can make 30 membership changes a minute (the `WRITE_LIMITER` binding in `platform/wrangler.jsonc`, counted per person, not per network address) and save 20 profile edits a day. Saving a profile without changing it records nothing. Past a limit the app answers 429 with a message saying when to try again.

## Organization role versus base access level

The account shows the effective **organization role**, separate from the **base access level** in the member editor. An active owner appears as **Admin (owner)**. Ownership grants all permissions, regardless of whether the base level is named Member. The initial owner was intentionally bootstrapped with that base level; that name never limited owner authority.

An ordinary active Member has only `members.read` by default: they can browse the limited directory, but cannot manage members, change levels or see activity. Explicit permissions can grant additional access. A member with `members.manage` or `levels.manage` appears as **Admin**, while an audit-only delegate appears as **Activity reviewer**. The label describes effective access; it does not grant it. Custom level names are not security roles, and renaming a level does not change its permissions. Pending/suspended members have no organization access.

If an account unexpectedly has administrative access, inspect its ownership flag, base level permissions and individual Allow/Revoke settings. Do not infer authority from the level name alone. Server checks remain authoritative; hiding a button is insufficient. Changing these labels does not promote accounts or modify production membership data.

## Production activation checklist

Sign-in is Slice's own Google sign-in (design: [in-app sign-in](superpowers/specs/2026-11-05-in-app-sign-in-design.md)). It replaced Cloudflare Access on November 5, 2026. Each step below changes production and needs maintainer authorization.

1. **Google OAuth client.** In Google Cloud, create a Web application OAuth client with the authorized redirect URI `https://sliceos.app/api/auth/google/callback`. Put its client ID in `GOOGLE_CLIENT_ID` in `platform/wrangler.jsonc` through a reviewed PR. Set the secret yourself with `pnpm --filter @slice/launcher exec wrangler secret put GOOGLE_CLIENT_SECRET`, never in Git or chat. Until both exist, sign-in fails closed with "Sign-in is not set up yet". The consent screen's audience must be **External** so accounts outside Syracuse's Workspace can sign in. Slice asks only for `openid email profile`, so a Testing-status app needs no test-user list.
2. **Database.** Apply migrations to the private `slice-membership` database: `pnpm --filter @slice/launcher exec wrangler d1 migrations apply slice-membership --remote`. `0002_sessions.sql` adds the `sessions` table and `0003_session_email_managed.sql` records whether Google manages each session's address. Check the target account before confirming.
3. **Initial owner (new environments only).** Set the singleton organization's `owner_email` to the confirmed, normalized email with a private operator SQL file and `wrangler d1 execute`. Guard it with `owner_claimed = 0` and an empty members table. Never derive ownership from whoever visits first, and keep real emails and that SQL out of Git.
4. **Release.** Deploy through the normal pull-request gate. The post-deploy check accepts both the Access redirect and in-app sign-in, so this works before and after Access is switched off.
5. **Switch off Cloudflare Access.** In Workers & Pages → slice-launcher → Settings → Domains & Routes → `workers.dev`, disable Cloudflare Access, then delete the Access application. Existing members are moved from their old Access identity (`LEGACY_ACCESS_ISSUER`) to their Google identity on their first Google sign-in, with an audit record.
6. **Verify with real accounts.**
   - The owner signs in and keeps owner access.
   - A second existing member signs in and keeps their access.
   - A new person starts pending.
   - A personal Google account using a member's Syracuse address is refused.
   - Approval, revocation, suspension with an existing session, and Sign out all work.
   - Direct API requests without a session are denied.
   - Do not claim activation from synthetic tests.

**Access leftovers.** Access was switched off on November 5, 2026, and the production checks no longer use the `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` service token. Delete those two secrets from the GitHub `production` environment and revoke the `slice-launcher-ci` service token in Cloudflare. Keep `LEGACY_ACCESS_ISSUER` until every member has signed in with Google once.

**Rollback.** Releases before PR #62 expect Access identities and fail closed without Access, so rolling back past it means re-enabling Access and restoring members' previous subjects by hand; the rollback workflow's checks refuse those targets. Members already moved to Google identities would need their previous subjects restored from the audit history.

The D1 database ID and application code may be public. Member records, session tokens, the Google client secret and operator bootstrap data must remain private.

## Local verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm smoke:launcher`. Integration tests create disposable Miniflare D1 databases and synthetic signed identities. They exercise pending enrollment, invitations, approval, directory privacy, stale writes, audit rollback, suspension, wrong-audience tokens, forged tokens, service tokens, request size, and same-origin writes.

For local Wrangler storage, run `pnpm --filter @slice/launcher exec wrangler d1 migrations apply slice-membership --local`. Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, sign-in fails closed with a clear message; there is no development identity shortcut. The deployed route has no unsigned test-user header or first-visitor owner mode.

## Future apps and recovery

Registering a module in `platform/apps/<id>/app.json` creates an `app.<id>.open` capability plus its declared action permissions. The platform verifies identity, loads current D1 membership, and checks that capability before invoking either an app page or API. Apps use the existing Slice session, origin, membership administration and deployment. Action-specific rules use `context.requirePermission("records.edit")` for declared actions. Membership is reloaded on every request; pages are dynamic and API responses are private/no-store. Applications must still validate their own domain data and enforce resource ownership.

New apps are not automatically accessible to ordinary members: a new app is private with nobody added, so only owners can open it until someone edits its settings. Active owners receive all registered capabilities. Pending and suspended members cannot enter apps.

## App access

Who can open an app, and who runs it, is set on the app's own page: the **Details** button on its launcher tile, at `/about/<id>`. The page shows the app's guide to everyone who can open it and a **Manage this app** section to the people who run it. Design: [app access](superpowers/specs/2026-11-18-app-access-design.md).

- **Public or Private.** A public app is open to every active member. A private app is open only to the people added to it by name, and to its managers. Pending, invited and suspended people open nothing; an invited person added to an app gets it once they sign in and are active.
- **A new app starts Private with nobody added.** Only owners can open it until its settings are saved.
- **Managers.** Each app has zero or more managers. A manager can switch Public and Private, add and remove people, tick people's extra powers, and add and remove managers, including themselves. A manager holds all of their app's permissions and has no say over any other app, over members or over access levels.
- **Owners can manage every app.** An owner names an app's first manager, and can always step in if a manager leaves. Membership administrators (`members.manage`, `levels.manage`) cannot change an app's settings.
- **Extra powers.** An app's `app.json` marks the permissions that come with access with `"withAccess": true`; everyone who can open the app holds those. Every other declared permission is an extra power a manager gives to named people with a tick box. Someone can hold an extra power in a public app; they are listed on the app for that reason.
- **One place.** Access levels and individual Allow and Revoke no longer carry app permissions. One left over from an earlier release grants nothing, and a save that includes one is refused. There is no per-person block inside a public app: to keep someone out of an app make it Private, and to keep them out of Slice suspend them.
- **What people see.** The launcher shows a person only the apps they can open or run. Someone who follows a link to a private app they are not on is told it is private and who runs it. Names of managers are shown only to people who can already see the member directory or are on the app; nobody is shown an email address they could not already see.
- **Opening to everyone asks first.** Switching Private to Public states how many active members, and how many invited people, it opens the app to before saving.
- **Records and limits.** Each change is recorded in **Activity** with the settings before and after. Changes count against the same 30-a-minute limit as membership changes and use the same "someone else saved first, reload" protection. Removing a member also takes them off every app.
- **AI apps follow at once.** `/mcp` reloads membership on every call, so someone taken off an app, or left out when it goes private, loses its tools on their next request.

Settings live in the `app_settings` table (migration `0010_app_settings.sql`). The code is released before the migration is applied: until then every app behaves as private with nobody added, and saving settings answers 503 "App settings cannot be saved yet." Apply the migration through the [approved process](migrations.md). Rolling the code back returns to the old level rules, under which nobody but owners holds app access, so a rollback closes apps rather than opening them.

Email/identity changes and loss of the last owner's sign-in require an operator recovery procedure with verified identity and an audit record. The normal UI does not let members rebind their identities. Changes use a global revision: if someone else saves first, reload and reapply your intended edit. This prevents a stale screen from overwriting a newer suspension or access change.

## Remote MCP clients

Consultants using the shared `/mcp` endpoint connect through Slice's own OAuth sign-in: their AI app opens the `/authorize` approval page, which uses their Slice session (signing in with Google first if needed), and they choose **Allow**. The grant carries their sign-in subject and email, so every request reloads current D1 membership. Suspending or revoking a member stops their connected apps on the next request, and members can disconnect apps under **Connected apps** on their account page; no separate MCP role database or shared service login exists. Tools require app access plus their declared action, and calls recheck permissions immediately before dispatch. MCP does not enroll a new member; use the browser account/approval flow first. See [MCP setup and tool contracts](mcp.md).
