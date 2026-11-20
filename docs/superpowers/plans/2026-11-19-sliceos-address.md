# Launcher on sliceos.app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the launcher at `https://sliceos.app` and be able to retire the `workers.dev` address with a redirect, as two separate, reversible steps.

**Architecture:** The launcher already takes its address from each request (Google callback, same-origin checks, AI sign-in metadata), so it runs unchanged on a second address. This plan adds the address as a Cloudflare custom domain and a redirect from listed former addresses that is switched on by configuration. Two pull requests: the first adds the address and leaves everything else as it is; the second, merged on the day Ivan chooses, turns the redirect on and changes the address Slice tells people to use.

**Tech Stack:** Cloudflare Workers (Wrangler 4), vinext, vitest, Miniflare.

**Spec:** `docs/superpowers/specs/2026-11-19-member-apps-design.md`, "Order of work", release 1.

## Global Constraints

- The move is two steps. Nothing a member sees changes until the second pull request is merged.
- The redirect is off unless `FORMER_HOSTS` names the request's host, and a bad or missing `LAUNCHER_ORIGIN` leaves the old address serving (fail open; never a loop).
- Redirects answer `308` (the method is kept) with `Cache-Control: no-store`, so turning the redirect off takes effect at once.
- No production setting is changed by this plan. The steps only Ivan can do are written in `docs/launcher-address.md`.
- No real email addresses or secrets in Git.

## Review Focus

- A former host that is also the launcher origin (misconfiguration) must not loop.
- Host matching ignores case and a trailing dot; a host that merely ends with a former host does not match.
- The path and query survive the redirect exactly; the fragment is the browser's.
- Plain HTTP on a former host goes to HTTPS first, then to the new address (two hops, never plain HTTP to the new address skipped).
- A request to an unlisted host (preview, localhost, the smoke check) is never redirected.

---

### Task 1: The redirect rule

**Files:**

- Create: `platform/src/platform/address.ts`
- Test: `platform/src/platform/address.test.ts`

**Interfaces:**

- Produces: `type AddressEnv = { LAUNCHER_ORIGIN?: string; FORMER_HOSTS?: string }`; `movedTo(url: URL, env: AddressEnv): string | null`, the full address to send the request to, or `null` to serve it here.

- [ ] **Step 1: Write the failing tests** for: a former host redirects with path and query kept; the launcher's own host, an unlisted host and a look-alike suffix do not; several former hosts separated by commas and spaces; upper case and a trailing dot in the list; empty or missing `FORMER_HOSTS`; `LAUNCHER_ORIGIN` missing, not HTTPS, carrying a path, or itself a former host all return `null`.
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/platform/address.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `movedTo`.**
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 2: The Worker applies it

**Files:**

- Modify: `platform/src/ai-connections/oauth.ts` (`SliceWorkerEnv`, `createSliceWorker`)
- Modify: `platform/src/ai-connections/oauth-worker.test.ts`
- Modify: `platform/vitest.config.ts` (coverage floor for `address.ts`, if the file lists per-file floors)

**Interfaces:**

- Consumes: `movedTo`, `AddressEnv`.

- [ ] **Step 1: Write the failing tests** in the Worker suite, with the runtime given `LAUNCHER_ORIGIN = "https://slice.example"` and `FORMER_HOSTS = "old.slice.example"`: `GET https://old.slice.example/account?next=%2F` answers 308 to `https://slice.example/account?next=%2F` with `no-store`; `POST https://old.slice.example/mcp` answers 308 to `https://slice.example/mcp`; `http://old.slice.example/` answers 308 to `https://old.slice.example/`; `https://slice.example/api/...` is served as before.
- [ ] **Step 2: Run** `pnpm --filter @slice/launcher exec vitest run src/ai-connections/oauth-worker.test.ts`. Expected: the new tests FAIL (404 or 401 instead of 308).
- [ ] **Step 3: Implement.** After the HTTP-to-HTTPS step in `createSliceWorker`, answer `movedTo` with a 308 through `withSecurityHeaders`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 3: Configuration, guide and first pull request

**Files:**

- Modify: `platform/wrangler.jsonc` (`routes`, `LAUNCHER_ORIGIN`, `FORMER_HOSTS`), `platform/worker-configuration.d.ts` (regenerated)
- Create: `docs/launcher-address.md`
- Modify: `docs/deployment.md`, `docs/README.md` (links)

- [ ] **Step 1:** Add `"routes": [{ "pattern": "sliceos.app", "custom_domain": true }]`, `"LAUNCHER_ORIGIN": "https://sliceos.app"` and `"FORMER_HOSTS": ""`. Run `pnpm --filter @slice/launcher cf-typegen`.
- [ ] **Step 2:** Write `docs/launcher-address.md`: what has to be true before each pull request is merged, how to check the new address, what members do on move day, and how to go back.
- [ ] **Step 3:** Run the contributor gate (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, `pnpm build`, `pnpm smoke:launcher`). Expected: all pass.
- [ ] **Step 4:** Commit, push, open the pull request "Serve the launcher at sliceos.app".

### Task 4: The move-day pull request

**Files:**

- Modify: `platform/wrangler.jsonc` (`FORMER_HOSTS`), `platform/worker-configuration.d.ts`
- Modify: `platform/src/connect-ai/instructions.ts`, `README.md`, `docs/connect-your-ai.md`, `docs/membership.md`, `docs/launcher-address.md`
- Test: `platform/src/connect-ai/instructions.test.ts`

- [ ] **Step 1: Write the failing test:** the connection address is `https://sliceos.app/mcp` and the instructions name no `workers.dev` address.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3:** Change the constants, set `FORMER_HOSTS` to `slice-launcher.ivan27chen.workers.dev`, regenerate types, update the docs.
- [ ] **Step 4: Run the gate.** Expected: all pass.
- [ ] **Step 5:** Commit on a branch stacked on Task 3's, push, open the pull request "Move the launcher to sliceos.app" as a draft that says what must be true before it is merged.
