# Member Apps, Release 2b (Server Code and a Database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member app can include server code that answers its `/api/` addresses and keeps data in a database only that app can reach.

**Architecture:** An app's `worker.js` is uploaded to a Cloudflare Workers for Platforms dispatch namespace as its own Worker, with exactly one thing attached: that app's own D1 database. The launcher's front door, after its existing checks, forwards `/api/` requests to the live version's Worker with the member's identity in headers it controls, and cleans the answer. A separate outbound Worker refuses every call the app's code makes to anywhere else.

**Tech Stack:** Cloudflare Workers for Platforms, D1, the Cloudflare REST API, vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-member-apps-design.md`.

## Global Constraints

- Server code is off unless member apps are on **and** the dispatch namespace binding (`APPS`) and the two secrets (`APPS_ACCOUNT_ID`, `APPS_API_TOKEN`) are present. Off: a publish that includes `worker.js` is refused with a sentence saying so, and `/api/` answers as in release 2a.
- An app's Worker is uploaded with one binding, `DB`, its own database, and nothing else: no secrets, no other database, no service.
- Each publish uploads its Worker under a name unique to that publish, so two publishes at the same moment cannot overwrite each other and putting an earlier version live changes nothing in Cloudflare.
- The request an app's code receives carries no cookie and no `Authorization`, and no `X-Slice-*` header the browser sent. The launcher adds `X-Slice-Member-Id`, `X-Slice-Member-Name` (percent-encoded), `X-Slice-Manager` and `X-Slice-Powers`.
- The answer an app's code gives loses any `Set-Cookie` and gets the same browser rules as every other response from an app address.
- An app's code gets 50 ms of processing and 50 subrequests per request.
- The Cloudflare token never appears in an error, a log line or a tool result.
- Cloudflare's local runtime cannot run a dispatch namespace, so the Worker itself is a stand-in in tests. Every claim about what Cloudflare isolates is marked unverified until checked on the real account.

## Review Focus

- A publish whose database is created but whose save is refused: the next publish must find and reuse that database, not make another.
- A version without `worker.js` published after one with it: `/api/` must answer "no server code", not run the old Worker.
- Headers named `x-slice-member-id` in any capitalisation sent by the browser.
- A Worker that answers with `Set-Cookie`, a redirect to another site, or a body after the launcher has refused the request.
- A Cloudflare API failure during publish: nothing is saved, and the message says what to do.

---

### Task 1: The Cloudflare side

**Files:** create `platform/src/member-apps/cloud.ts`, test `cloud.test.ts`.

**Interfaces (produced):** `interface AppCloud { ensureDatabase(appId: string): Promise<string>; uploadServer(script: string, code: string, databaseId: string, appId: string): Promise<void> }`; `cloudflareApps(config: { accountId: string; token: string; namespace: string; fetch?: typeof fetch }): AppCloud`.

- [ ] Tests first with a recorded `fetch`: the exact address, method, token header and upload metadata; finding an existing database by name; failures that do not leak the token. Then the code. Commit.

### Task 2: Publishing server code

**Files:** modify `publish.ts`, `service.ts`, `membership/contracts.ts`, `membership/domain.ts`, `tools.ts`; tests beside each.

**Interfaces (produced):** `Bundle.server: string | null`; `MemberApp.database: string | null`; `VersionRecord.server: { script: string } | null`; `memberapp.publish` takes `database: string | null`; `MemberAppsDeps.cloud?: AppCloud`.

- [ ] Tests first, then code. Commit.

### Task 3: Answering `/api/`

**Files:** modify `front-door.ts`, `runtime.ts`, `worker/index.ts`; tests in `front-door.test.ts`.

**Interfaces (produced):** `FrontDoorDeps.server?: (script: string) => { fetch(request: Request): Promise<Response> } | null`.

- [ ] Tests first for every Global Constraint on requests and answers, then code. Commit.

### Task 4: The outbound Worker, guides, checks, pull request

**Files:** create `platform/outbound/index.js`, `platform/outbound/wrangler.jsonc`; modify `docs/member-apps.md`, `docs/architecture.md`, `docs/data-boundary.md`.

- [ ] Full contributor gate. Commit, push, open the pull request stacked on release 2a.
