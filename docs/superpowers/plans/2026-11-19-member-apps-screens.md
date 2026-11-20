# Member Apps, Release 2a (Screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member's AI can create an app and publish its screens through the launcher; the app is live at `https://<id>.sliceos.app` for the people its managers choose, with no server code, no Git and no Cloudflare purchase.

**Architecture:** Member apps are a second kind of entry in the membership state, beside the built-in catalog, so the stage 1 settings, permissions and app page apply unchanged. The launcher's Worker answers every app address itself: it signs the person in through a one-time pass from the launcher, checks membership and app access on every request, and serves the live version's files from a store it owns. Everything is switched off until configured.

**Tech Stack:** Cloudflare Workers, D1, KV, vinext, zod, vitest, Miniflare, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-member-apps-design.md`, including "Decisions made while planning".

## Global Constraints

- Member apps are off unless `MEMBER_APPS_ENABLED` is exactly `"true"` and the `APP_FILES` store is bound. Off means: no app address is served, the four tools are not offered, and nothing else changes.
- An app address is `<id>.<launcher host>`. Any other name under the launcher's host answers 404 and never reaches the launcher's pages, sign-in or AI sign-in.
- App IDs: 3 to 32 characters, lower-case letters, digits and single hyphens, starting with a letter and ending with a letter or digit. Reserved names, built-in app IDs and every ID ever used are refused.
- Limits: five apps per member (owners unlimited); per publish 50 files, 512 KB per file, 1 MB in total; guide 20,000 characters; 20 extra powers.
- App pages get: `Content-Security-Policy` allowing only the app's own address (`connect-src 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`), `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-cache`.
- The launcher's session cookie never reaches an app address; an app session is `__Host-slice_app`, HttpOnly, tied to one app and to the launcher session it came from, and lasts 24 hours.
- Membership and app access are reloaded on every request to an app address.
- A one-time pass lasts 60 seconds, works once, and only at the app it was issued for.
- Code is released before its migration: a missing table means "no member apps", never a failure of sign-in or of built-in apps.
- Every create, publish, unpublish, delete, share and approval adds one Activity entry.
- No real email addresses or secrets in Git. Plain business tone in everything a member reads.

## Review Focus

- A request to `a.sliceos.app` that carries a session issued for `b.sliceos.app`.
- A pass replayed, expired, or presented at another app.
- `next` values that leave the app (`//evil.test`, `https://evil.test`, backslashes).
- File paths that climb out of the version (`../`, encoded `%2e%2e`, a leading slash, a NUL).
- A page on one app requesting or posting to another app, or to the launcher.
- A member suspended, removed, or taken off the app between two requests.
- A manager publishing a version that drops a power people hold.
- Publishing while another change is saved (revision conflict) must not leave a live version without files.

---

### Task 1: Member apps in the membership state

**Files:**

- Modify: `platform/src/membership/contracts.ts`, `platform/src/membership/domain.ts`, `platform/src/membership/app-access.ts`, `platform/src/membership/repository.ts`, `platform/src/platform/access.ts`
- Create: `platform/src/member-apps/rules.ts`, `platform/src/member-apps/registry.ts`, `platform/migrations/0011_member_apps.sql`
- Test: `platform/src/member-apps/rules.test.ts`, `platform/src/member-apps/registry.test.ts`, additions to `repository.test.ts`, `migrations.test.ts`

**Interfaces (produced):**

- `interface MemberApp { id; name; description; powers: {id; label}[]; createdBy: string; createdAt: string; live: number | null; latest: number; publicApproved: boolean; publicRequestedBy: string | null; deletedAt: string | null }`
- `State.memberApps: MemberApp[]`
- `rules.ts`: `appIdProblem(id: string, taken: readonly string[]): string | null`; `APP_LIMIT = 5`.
- `registry.ts`: `memberAppDescriptor(app: MemberApp): AppDescriptor`; `catalogFor(state: State): AppDescriptor[]` (built-in apps, then member apps that are not deleted).
- Commands: `memberapp.create {id, name, description}`, `memberapp.publish {id, name, description, powers}` (sets `latest += 1` and `live = latest`), `memberapp.live {id, version: number | null}`, `memberapp.delete {id}`.
- `app.update` on a member app: a non-owner saving Public before approval keeps it Private and sets `publicRequestedBy`; an owner saving Public sets `publicApproved`; an owner saving Private clears the request.
- `Repository.commit(before, mutation, extra?: { version?: VersionRecord })`; `Repository.version(appId, version)`, `Repository.versions(appId)`.
- `interface VersionRecord { appId; version; at; publishedBy; name; description; guide; powers; files: {path; type; size}[] }`

- [ ] Tests first for each rule, then the code; run `pnpm --filter @slice/launcher exec vitest run src/member-apps src/membership`. Expected after: PASS, coverage floors hold.
- [ ] Commit.

### Task 2: Files and publishing

**Files:**

- Create: `platform/src/member-apps/files.ts`, `platform/src/member-apps/publish.ts`, `platform/src/member-apps/service.ts`
- Test: `files.test.ts`, `publish.test.ts`, `service.test.ts`

**Interfaces (produced):**

- `interface AppFiles { put(appId, version, files: StoredFile[]): Promise<void>; get(appId, version, path): Promise<{ body: ArrayBuffer; type: string } | null>; remove(appId, versions: number[], paths...)` (KV implementation `kvFiles(kv)`, in-memory `memoryFiles()` for tests).
- `readBundle(input: unknown): Bundle` validates paths, sizes, types and text or base64 content; throws `MembershipError(400, …)` with a sentence a builder's AI can act on.
- `class MemberApps { create; publish; status; list; setLive; remove }` over `{ repository, files, origin, now, id }`.

- [ ] Tests first, then code. Commit.

### Task 3: Sign-in across addresses

**Files:**

- Create: `platform/src/member-apps/app-sessions.ts`, `platform/src/member-apps/pass-route.ts`, `platform/app/api/app-pass/route.ts`
- Modify: `platform/src/membership/session.ts` (export the session key)
- Test: `app-sessions.test.ts`, `pass-route.test.ts`

**Interfaces (produced):**

- `issuePass(db, request, appId): Promise<string>`; `redeemPass(db, appId, pass, userAgent): Promise<string | null>` (the `Set-Cookie` value); `appIdentity(db, appId, request): Promise<SignedInIdentity | null>`.
- `passRequest(request, deps): Promise<Response>` for `GET /api/app-pass?app=<id>&next=<path>`.

- [ ] Tests first, then code. Commit.

### Task 4: The front door for app addresses

**Files:**

- Create: `platform/src/member-apps/front-door.ts`
- Modify: `platform/src/platform/address.ts` (`appHost`), `platform/src/ai-connections/oauth.ts`, `platform/worker/index.ts`, `platform/tests/ai-connections/worker.ts`
- Test: `front-door.test.ts`, `address.test.ts`, `oauth-worker.test.ts`

**Interfaces (produced):**

- `appHost(url: URL, env: AddressEnv): string | null | ""` (`null`: not under the launcher's host; `""`: under it but not a valid app name).
- `createFrontDoor(deps): (request: Request, appId: string) => Promise<Response>`.

- [ ] Tests first (including every Review Focus line), then code. Commit.

### Task 5: The four tools

**Files:**

- Create: `platform/src/member-apps/tools.ts`
- Modify: `platform/src/platform/mcp.ts`, `platform/src/platform/dispatch.ts` (dependencies), `platform/worker/index.ts`
- Test: `tools.test.ts`, additions to `mcp.test.ts`

- [ ] `slice_app_create`, `slice_app_publish`, `slice_app_status`, `slice_app_list`; each rechecks active membership and that the caller runs the app. Tests first. Commit.

### Task 6: The launcher shows and manages member apps

**Files:**

- Modify: `platform/src/membership/contracts.ts` (`AppView.member`, `View.appHost`), `domain.ts` (`memberView`), `api.ts`, `platform/src/lib/app-grid-view.tsx`, `about-view.tsx`, `app-manage.tsx`, `app-manage-model.ts`, `platform/app/about/[appId]/page.tsx`
- Test: `app-view.test.ts`, `app-grid.test.ts`, `about-view.test.ts`, `app-manage-model.test.ts`, `platform/tests/e2e/member-apps.spec.ts`

- [ ] Tiles for member apps, the app page with its guide, "Take offline", "Delete", and the owner's OK. Tests first. Commit.

### Task 7: Switch, guides, checks, pull request

**Files:**

- Modify: `platform/wrangler.jsonc` (`MEMBER_APPS_ENABLED: "false"`), `docs/membership.md`, `docs/mcp.md`, `docs/architecture.md`, `docs/data-boundary.md`, `docs/testing.md`, `README.md`, `AGENTS.md`
- Create: `docs/member-apps.md` (what a member app is, for builders and for the maintainer, including how to switch it on)

- [ ] Full contributor gate. Commit, push, open the pull request stacked on the move-day one.
