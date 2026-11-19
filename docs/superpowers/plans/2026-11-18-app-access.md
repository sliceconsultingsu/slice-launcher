# App Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each app is Public or Private and is run by its own managers, set on one page per app reached from the launcher tile.

**Architecture:** App settings are a new document type in the membership database, loaded into `State` and saved through the existing command, revision and audit path. `effectivePermissions` stays the single answer to "what may this person do", so app pages, app APIs and AI tools follow the new rules without their own changes. The launcher grid and the new app page are browser components that render from the membership view.

**Tech Stack:** TypeScript, React 19, vinext on Cloudflare Workers, D1, zod, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-app-access-design.md`

## Global Constraints

- Public means every member whose status is `active`. Pending, invited and suspended people open nothing.
- An app with no saved settings is Private with no managers and no people. Releasing this must change nobody's access.
- App permissions stored on a level or in a member's `allow`/`deny` grant nothing, and a save that includes one is refused.
- Only owners and that app's managers may change an app's settings. `members.manage` and `levels.manage` give no say.
- No browser response may show a manager an email address the membership view would not already show them.
- Tests use invented people only. No real names or addresses in code, fixtures, screenshots or the pull request.
- Tile button label: `Details`. Page address: `/about/<id>`; `/guides/<id>` redirects there.
- Empty launcher copy: `No apps have been shared with you yet.`
- Commit as `ichen27 <ivan27chen@gmail.com>`; no AI attribution anywhere.

## Review Focus

1. **A member is removed, suspended or returned to pending while listed on an app.** They lose the app at once; a removed member disappears from every app's people and managers. (Task 2)
2. **Settings name a member or power that no longer exists** (member removed by an older release, permission dropped from `app.json`). Access is worked out without error and the stale entry grants nothing. (Task 1)
3. **Two managers save the same app at once.** The second save is refused with the "reload" message and overwrites nothing. (Task 3)
4. **A membership administrator suspends someone who runs an app the administrator is not in.** It succeeds; app access does not count as outranking them. (Task 2)
5. **A signed-in person with no profile yet, or a pending person, opens the launcher or an app page.** They see a plain message and a link to their account, not an error or every tile. (Tasks 6 and 7)

## File structure

| File                                                         | Responsibility                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `platform/src/platform/contracts.ts` (modify)                | `withAccess` on a declared permission                               |
| `platform/src/membership/contracts.ts` (modify)              | `AppSettings`, `AppView`, `State.apps`, `app.update` command        |
| `platform/src/membership/app-access.ts` (create)             | Pure rules: settings lookup, who can open, who can manage, powers   |
| `platform/src/membership/domain.ts` (modify)                 | `effectivePermissions`, `app.update`, removal clean-up, view        |
| `platform/src/membership/repository.ts` (modify)             | Load and save `app_settings`                                        |
| `platform/migrations/0010_app_settings.sql` (create)         | The table                                                           |
| `platform/src/platform/access.ts` (modify)                   | `authorizeApp` uses the passed descriptor; refusal carries a reason |
| `platform/src/membership/membership-client.ts` (create)      | Browser fetch and save of the membership view                       |
| `platform/src/lib/app-grid.tsx` (create)                     | Launcher tiles for the apps this person can open or manage          |
| `platform/src/lib/about-view.tsx`, `app-manage.tsx` (create) | The app page and its manage section                                 |
| `platform/app/about/[appId]/page.tsx` (create)               | Route for the app page                                              |
| `platform/app/guides/[appId]/page.tsx` (modify)              | Redirect to `/about/<id>`                                           |
| `packages/ui/src/app-card.tsx` (modify)                      | `Details` button, `Private` label                                   |
| `scripts/platform-apps.mjs` (modify)                         | Validate `withAccess`; starter app                                  |

---

### Task 1: Access rules

**Files:**

- Modify: `platform/src/platform/contracts.ts`, `platform/src/membership/contracts.ts`, `platform/src/membership/domain.ts`, `platform/apps/alumni/app.json`
- Create: `platform/src/membership/app-access.ts`
- Test: `platform/src/membership/app-access.test.ts`

**Interfaces:**

- Produces, in `platform/src/platform/contracts.ts`: `permissions: { id: string; label: string; withAccess?: boolean }[]`
- Produces, in `platform/src/membership/contracts.ts`:

```ts
export const organizationPermissions: { id: string; label: string }[]; // the four existing ones
export interface AppSettings {
  id: string;
  visibility: "private" | "public";
  managers: string[]; // member IDs
  people: { memberId: string; powers: string[] }[]; // powers are app-local IDs, e.g. "admin"
}
// State gains: apps: AppSettings[]
```

- Produces, in `platform/src/membership/app-access.ts`:

```ts
export function settingsFor(state: State, appId: string): AppSettings; // stored, or Private and empty
export function managesApp(state: State, member: Member, appId: string): boolean; // active and (owner or listed manager)
export function appPermissions(state: State, member: Member, app: AppDescriptor): string[]; // full IDs, "app.<id>.…"
```

- Changes: `effectivePermissions(state, member, catalog: readonly AppDescriptor[] = apps): string[]`

- [ ] **Step 1: Write the failing tests** in `app-access.test.ts` against a two-app catalog (`notes` with `read` marked `withAccess` plus `admin`; `ledger` with `post` only):
  - private, unlisted active member: `[]`;
  - private, listed with no powers: `["app.notes.open", "app.notes.read"]`;
  - listed with `powers: ["admin"]`: adds `app.notes.admin`;
  - public, unlisted: open plus `read`, no `admin`;
  - manager: every `app.notes.*`, nothing for `ledger`;
  - owner: every permission of both apps;
  - pending, invited and suspended, each listed and each as manager: `[]`;
  - a level holding `app.notes.admin` and a member `allow` holding it: grants nothing;
  - `deny` of `app.notes.open` on a public app: still open (no per-person block);
  - stale entries (unknown member ID in people, unknown power, settings for an app not in the catalog): no error, nothing granted;
  - organization permissions still come from level plus allow minus deny.
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/membership/app-access.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `app-access.ts` and the `effectivePermissions` change. Mark `records.read` in `platform/apps/alumni/app.json` with `"withAccess": true`. `emptyState` returns `apps: []`. Every existing `State` literal in tests gains `apps: []`.
- [ ] **Step 4: Run** the same command, then `pnpm --filter @slice/launcher exec vitest run src/membership`. Expected: PASS, except tests that grant app permissions through levels, which Task 5 moves.
- [ ] **Step 5: Commit** `Work out app access from each app's own settings`.

### Task 2: Saving settings

**Files:**

- Modify: `platform/src/membership/contracts.ts`, `platform/src/membership/domain.ts`
- Test: `platform/src/membership/domain.test.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces: command `{ type: "app.update", id, visibility, managers: string[], people: { memberId: string; powers: string[] }[] }` (at most 50 managers and 1000 people); audit action `app.update` with `targetId` the app ID, `before` the stored settings or `null`, `after` the new settings.
- Changes: the `permission` validator used by `level.save` and `member.update` accepts organization permissions only.

- [ ] **Step 1: Write the failing tests:**
  - the owner saves settings; they are stored, sorted and de-duplicated, and one audit entry is produced;
  - a listed manager saves their own app, including adding a co-manager and removing themselves;
  - refused with 403: an ordinary member, a manager of a different app, a holder of `members.manage` and `levels.manage`, a suspended manager;
  - refused with 400: unknown app, unknown member ID, a power that is not one of that app's extra powers (including one marked `withAccess`, and `open`);
  - `level.save` and `member.update` carrying `app.alumni.open` are refused with 400;
  - `member.remove` of someone listed as person and manager removes them from every app;
  - a `members.manage` holder who is in no app suspends a member who manages an app: succeeds (Review Focus 4);
  - suspending a manager leaves their entry in place and gives them no permissions (Review Focus 1).
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/membership/domain.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `app.update` is handled before the `members.manage` requirement. The "cannot change a member whose access exceeds your own" comparisons use organization permissions only.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Let owners and app managers save an app's settings`.

### Task 3: Storage

**Files:**

- Create: `platform/migrations/0010_app_settings.sql`
- Modify: `platform/src/membership/repository.ts`
- Test: `platform/src/membership/repository.test.ts`, `platform/src/membership/migrations.test.ts`

**Interfaces:**

- Produces: table `app_settings(id TEXT PRIMARY KEY, document TEXT NOT NULL CHECK (json_valid(document)))`; `Repository.load()` fills `State.apps`; `Repository.commit()` upserts changed settings in the same batch and revision guard.

- [ ] **Step 1: Write the failing tests:** settings survive a commit and reload; an unchanged app writes no row; a commit made against a stale revision is refused with 409 and stores nothing (Review Focus 3); the migration test's fresh and upgraded databases load `apps: []`.
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/membership/repository.test.ts src/membership/migrations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `0009` is taken by an open branch, so this is `0010`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Store app settings with membership`.

### Task 4: The membership view

**Files:**

- Modify: `platform/src/membership/contracts.ts`, `platform/src/membership/domain.ts`
- Test: `platform/src/membership/domain.test.ts`, `platform/src/membership/api.test.ts`

**Interfaces:**

- Produces:

```ts
export interface AppView {
  id: string;
  canOpen: boolean;
  canManage: boolean;
  visibility: "private" | "public";
  managers: string[]; // display names; empty unless the viewer is an active member
  settings?: AppSettings; // only when canManage
}
// View gains: apps: AppView[]  (one per catalog app)
//             counts?: { active: number; invited: number }  (only when the viewer manages an app)
// View.catalog is organization permissions only.
```

- [ ] **Step 1: Write the failing tests:** an ordinary member's view has no `settings` and no `counts`; a manager gets `settings` for their app only; a pending member gets `canOpen: false`, `managers: []` for every app; no `AppView` field contains an email address; a POST of `app.update` through `membershipRequest` returns the updated view, and a stale `revision` returns 409.
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/membership`. Expected: FAIL.
- [ ] **Step 3: Implement** in `memberView`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Tell each person which apps they can open and manage`.

### Task 5: App dispatch and fixtures

**Files:**

- Modify: `platform/src/platform/access.ts`, `platform/src/membership/contracts.ts` (`MembershipError` gains an optional `reason`), `platform/app/apps/[appId]/[[...path]]/page.tsx`, `platform/apps/alumni/tests/members.ts`, `platform/src/platform/dispatch.test.ts`, `platform/src/platform/mcp.test.ts`, `platform/tests/team/server.ts`, `scripts/signed-in-smoke.test.mjs`
- Test: `platform/src/platform/dispatch.test.ts`, `platform/src/platform/mcp.test.ts`, `platform/apps/alumni/alumni.test.ts`

**Interfaces:**

- Changes: `authorizeApp` calls `effectivePermissions(state, member, [app])` and throws `new MembershipError(403, "You do not have access to this application.", "no-app-access")`.
- Changes: the app route redirects a `no-app-access` refusal to `/about/<id>`; other 401 and 403 refusals still go to `/account`.

- [ ] **Step 1: Write the failing tests:** dispatch refuses an active member not on a private app and admits one who is; a public app admits any active member; an AI tool call is refused on the next call after the person is removed from the app, and after Public is switched to Private. In `alumni.test.ts`, with the real `app.json`: a listed person with no powers can read records and cannot use an admin route.
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/platform apps/alumni`. Expected: FAIL.
- [ ] **Step 3: Implement.** `platform/apps/alumni/tests/members.ts` keeps its people and their meanings by listing them in app settings and authorizing against a copy of the descriptor in which no permission is `withAccess`, so each action's own check is still exercised. The team preview's learner is listed on the alumni app.
- [ ] **Step 4: Run** `pnpm --filter @slice/launcher test` and `node --test scripts/*.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `Apply app settings wherever an app is opened`.

### Task 6: Launcher tiles

**Files:**

- Create: `platform/src/membership/membership-client.ts`, `platform/src/lib/app-grid.tsx`
- Modify: `platform/src/lib/home-views.tsx`, `platform/src/lib/apps.ts`, `packages/ui/src/app-card.tsx`
- Test: `platform/src/lib/app-grid.test.tsx` (or the existing home-view test file, following its style)

**Interfaces:**

- Produces: `loadView(): Promise<View | { needsEnrollment: true }>` and `saveCommand(revision: number, command: Command): Promise<View>`, both throwing `Error` with the server's message.
- Produces: `AppCard` props `detailsHref` (replaces `guideHref`) and `isPrivate?: boolean`.
- Produces: `getAboutUrl(app): string` returning `/about/<id>`; `getGuideUrl` is removed.
- Produces: `visibleApps(view: View): LauncherApp[]`, the catalog apps where `canOpen || canManage`.

- [ ] **Step 1: Write the failing tests:** `visibleApps` hides a private app the person is not on and keeps one they manage; the grid shows `No apps have been shared with you yet.` for an empty list; a person with no profile yet sees a line pointing to `/account` (Review Focus 5); the card renders `Details` linking to `/about/<id>` and shows `Private` only when asked.
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/lib` and `pnpm --filter @slice/ui test` if the package has tests. Expected: FAIL.
- [ ] **Step 3: Implement.** The grid is a browser component; `Launcher` renders it in place of the static list.
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `Show each person only the apps they can open`.

### Task 7: The app page

**Files:**

- Create: `platform/src/lib/about-view.tsx`, `platform/src/lib/app-manage.tsx`, `platform/app/about/[appId]/page.tsx`
- Modify: `platform/app/guides/[appId]/page.tsx`, `platform/app/globals.css`
- Test: `platform/src/lib/app-manage.test.tsx`, `platform/tests/e2e/apps.spec.ts`, `platform/tests/e2e/main.tsx`, `platform/tests/e2e/server.ts`

**Interfaces:**

- Consumes: Task 4's `AppView`, Task 6's `loadView` and `saveCommand`.
- Produces: `AboutView({ app, guide }: { app: LauncherApp; guide: ReactNode })`, a browser component the route and the browser-test harness both mount.

Behavior the tests pin:

- Not signed in: the sign-in card. No profile or not active: a line saying membership is not active yet, linking to `/account`.
- Active without access: `This app is private.` and `Ask <names> for access.`, or `Ask the Slice owner for access.` when it has no manager. No guide, no Open button.
- With access: name, description, work-in-progress label, `Public` or `Private`, `Run by <names>`, `Open`, then the guide.
- Managers and owners also get **Manage this app**: the Public/Private choice with one line each (`Every active member of Slice` / `Only the people you add below`); **People** with one tick box per extra power, add and remove; **Managers** with add and remove; `Save changes`.
- Saving a switch from Private to Public first shows `This opens <name> to all <n> active members, and to <m> invited people as they sign in.` with `Open to everyone` and `Cancel`.
- The add lists offer `view.members` not already listed. A listed member who is not in `view.members` is shown as `Invited member`.

- [ ] **Step 1: Write the failing tests.** Unit: the manage form builds the right `app.update` command for add person, tick power, remove person, add and remove manager; the Public confirmation appears only for Private to Public. Browser (`apps.spec.ts`, invented people): the owner makes an app Public and a member's launcher gains the tile; the owner makes it Private and adds the member with one power; a manager sees **Manage this app** and a member does not; a member without access sees the private message; `/guides/<id>` lands on `/about/<id>`; accessibility scan on the page as owner and as member, at desktop and 390px widths.
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/lib` and `pnpm test:e2e`. Expected: FAIL.
- [ ] **Step 3: Implement.** The harness serves `/about/<id>` by mounting `AboutView`. Follow `docs/design-profile.md` for controls, labels and focus.
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `Give each app one page for its guide and its settings`.

### Task 8: Membership screens, catalog check and starter

**Files:**

- Modify: `platform/src/membership/editors.tsx` (only if copy mentions app permissions), `scripts/platform-apps.mjs`, `scripts/platform-apps.test.mjs`, `platform/src/platform/catalog.generated.json` (by `pnpm apps:sync`)
- Test: `scripts/platform-apps.test.mjs`, `platform/tests/e2e/membership.spec.ts`

- [ ] **Step 1: Write the failing tests:** the catalog check accepts `"withAccess": true`, rejects `false` and any other value, and still rejects unknown keys; a created starter app's basic permission has `withAccess`; the level editor and member editor offer the four organization permissions only.
- [ ] **Step 2: Run** `node --test scripts/platform-apps.test.mjs` and `pnpm test:e2e`. Expected: FAIL.
- [ ] **Step 3: Implement,** then run `pnpm apps:sync`.
- [ ] **Step 4: Run** the same commands and `pnpm check:platform`. Expected: PASS.
- [ ] **Step 5: Commit** `Declare which app permissions come with access`.

### Task 9: Documentation

**Files:**

- Modify: `docs/membership.md`, `docs/adding-an-app.md`, `docs/design-profile.md`, `platform/apps/README.md`, `platform/apps/alumni/README.md`, `platform/apps/alumni/guide.md` (how to get access), `AGENTS.md` (the platform rule that names access levels), `README.md` if it describes granting app access

- [ ] **Step 1: Update** each to say access is set on the app's page by its managers, what Public and Private mean, what `withAccess` does, and that the tile button is **Details**.
- [ ] **Step 2: Run** `pnpm format:check`. Expected: PASS.
- [ ] **Step 3: Commit** `Document app managers and Public or Private apps`.

### Task 10: Full gate and pull request

- [ ] **Step 1: Run** the contributor checks in `CONTRIBUTING.md#4-implement-and-check` from the repository root. Expected: all PASS.
- [ ] **Step 2: Capture** desktop (1440px) and mobile (390px) screenshots of the launcher and the app page with invented people.
- [ ] **Step 3: Review** the full diff against the spec's "What would make this a failure" list.
- [ ] **Step 4: Push and open the pull request** with the template: problem, resulting behavior, tests run, unverified paths, and that the migration only adds a table.
