# Slice platform readiness evaluation — October 16, 2026

**Type:** historical evaluation report. It records what was tested on one day against one revision and is not current setup guidance. It changes no production setting.
**Companion material** (proposed separately in [PR #35](https://github.com/sliceconsultingsu/slice-launcher/pull/35), which keeps this report within the advisory reviewer's input limit):

- [full evidence appendix](https://github.com/sliceconsultingsu/slice-launcher/blob/test/readiness-evaluation-suites-2026-10-16/docs/evaluations/2026-10-16-platform-readiness-evidence.md)
- [machine-readable results](https://github.com/sliceconsultingsu/slice-launcher/blob/test/readiness-evaluation-suites-2026-10-16/docs/evaluations/2026-10-16-platform-readiness.json)
- [reusable evaluation tests](https://github.com/sliceconsultingsu/slice-launcher/blob/test/readiness-evaluation-suites-2026-10-16/platform/tests/evaluation/README.md)

## The short version

The foundation is sound in the places that matter most. In every test run here, the server, not the screen, decided who could do what. Suspending someone or revoking an access right took effect on that person's very next request. Delegated administrators could not grant more access than they hold. The last owner could not be removed. Private fields stayed private. Two independent checks deliberately broke permission rules in the code: both the existing test suite and the new permission matrix caught every one.

The surrounding controls are not yet ready for more contributors:

- **Production is not protected from unreviewed changes.** Anyone with Write access can merge their own pull request, and merging releases to production automatically. One such collaborator already exists. GitHub's security settings are also weaker than the security guide says.
- **Releases are not reliably verified.** 7 of the last 10 releases failed their post-release check and were left running. The live site is probably serving a release that never passed verification.
- **The app-builder path breaks on its first step.** Creating an app with the documented command turns the required tests red. Contributors also cannot preview their app locally, and app code can bypass the platform's privacy boundary without any check noticing.
- **Personal AI connections are not switched on in production.** The advisory AI reviewer rarely completes a review today and is likely to be blocked by a GitHub policy change on November 2, 2026.

| Who                                    | Ready?                            | In one sentence                                                                                                                                                                |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Consultants **using** the platform     | **Usable, with caveats**          | Sign-in, approval, access levels, the directory and activity history behave correctly in testing. There are no business apps yet, and the current release is unverified.       |
| Consultants **building** apps          | **Not ready without supervision** | Inheritance of login, permissions, MCP and deployment works. The first app PR fails CI, cannot be previewed, can bypass the privacy boundary and can be merged without review. |
| Consultants **connecting personal AI** | **Not available**                 | The code and synthetic tests are in place, but production sign-in for AI clients has not been activated; an official MCP client cannot connect.                                |

**Ready:** server-side permission enforcement; membership data integrity under concurrent and repeated requests; one shared build and release artifact for all apps; honest status reporting by the AI reviewer and the AI-connection guide.
**Blocked:** maintainer review enforcement; reliable release verification; a working first-app path; personal AI connections; the advisory reviewer after November 2.
**Unknown:** real Google sign-in and the Cloudflare Access policy as members see them; the exact version serving production now; live rollback and database restore in Cloudflare; the AI reviewer's detection rate on new known-defect cases (that run needed the owner's review credential and was not performed).

## What was evaluated

| Item                    | Value                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                    | 2026-10-16, about 14:50–15:40 US Eastern (testing); the advisory review rounds followed                                                                                                                                                             |
| Repository              | `sliceconsultingsu/slice-launcher`, public; `main` at `f1f1c4d` (PR #30)                                                                                                                                                                            |
| Live application        | `slice-launcher.ivan27chen.workers.dev`: Cloudflare Worker `slice-launcher` behind Cloudflare Access, D1 database `slice-membership`                                                                                                                |
| Newest uploaded release | Worker version `818e63d6` from `f1f1c4d`, uploaded 02:24 UTC by run 38840089613; **failed verification**                                                                                                                                            |
| Last verified release   | Worker version `296675a9` from `f304a50` (PR #33), run 38836715991; verified record kept until 2027-01-14                                                                                                                                           |
| Open pull requests      | #31, design profile part 1: required `validate` failing. #13–#20, Dependabot updates: all checks pass, unmerged                                                                                                                                     |
| Evaluator               | Claude Opus 5.5 (the repository's recommended model) in Claude Code, working in isolated worktrees on the maintainer's development machine. The agent cannot see its own reasoning-effort setting. Four parallel helper agents used the same model. |

**Implemented, deployed or planned:**

| Capability                                                      | Implemented in `main` | Deployed                                                                    | Notes                                  |
| --------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| Launcher, sign-in, membership approval, access levels, activity | Yes                   | Yes. Last verified release `f304a50`; the newest release is unverified (S2) | Real Google sign-in not exercised here |
| Shared app routes and module contract                           | Yes                   | Yes. The catalog is empty                                                   | No business apps exist                 |
| Shared MCP endpoint `/mcp`                                      | Yes                   | Code deployed; **AI-client sign-in not activated**                          | S11                                    |
| Release pipeline with provenance and rollback                   | Yes                   | Releases run; rollback never run live                                       | S2, S7                                 |
| Advisory AI reviewer (Claude Opus 5.5 subscription route)       | Yes                   | Running on PRs                                                              | S4, S5, S6                             |
| Alumni directory                                                | No                    | No                                                                          | Planned                                |

**Evidence used.** Read-only GitHub API calls, workflow logs, unauthenticated requests to the live site (no credentials and no load), the documented check suite, local builds of the Worker, and new tests that run the real code against disposable in-memory databases with synthetic identities. Earlier reports and rollout notes in the repository and the maintainer's notes were treated as leads and checked again. Where a claim could not be checked, it is marked **unverified**.

## Findings, in priority order

Severity reflects business impact today. "Reproduced" means the evaluator ran it and saw the result. "Confirmed from settings" means read-only inspection of live configuration. "Reasoned" means source or documentation analysis without execution.

| ID                 | Severity | Finding                                                                                                         | Affects                                 | Status                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| S1                 | High     | A Write collaborator can merge their own PR, and merging deploys to production                                  | Production, all members                 | Confirmed from settings                  |
| S2                 | High     | 7 of the last 10 releases failed post-release verification; failed releases stay live                           | Production, all members                 | Reproduced (logs)                        |
| A1                 | High     | App code can read the whole membership database; no check notices                                               | Member privacy                          | Reproduced locally                       |
| S3                 | High     | Creating an app with the documented command makes required tests fail                                           | App builders                            | Reproduced                               |
| G1                 | High     | Contributors cannot see their app, or any signed-in page, before production                                     | App builders                            | Reproduced                               |
| S8                 | Medium   | Secret scanning, push protection and private vulnerability reporting are off; the guide says on                 | Public repository                       | Confirmed from settings                  |
| S9                 | Medium   | The organization does not require two-factor authentication                                                     | Accounts with Write access              | Confirmed from settings                  |
| S4                 | Medium   | The advisory reviewer is likely blocked from November 2, 2026 (GitHub `pull_request_target` default policy)     | Contributors                            | Reasoned (GitHub docs and live settings) |
| S5                 | Medium   | The advisory review completed on 2 of 8 recent PRs; valid findings can be discarded                             | Contributors                            | Reproduced                               |
| S6                 | Medium   | Any GitHub user can spend the owner's review subscription                                                       | Owner, contributors                     | Reasoned                                 |
| S7                 | Medium   | A Write collaborator can roll production back without approval                                                  | Production                              | Confirmed from settings                  |
| A2                 | Medium   | A route added outside the guarded folders ships without a membership check                                      | Member privacy                          | Reproduced locally                       |
| A3                 | Medium   | Test code can alter the release configuration before the build                                                  | Production                              | Reproduced up to the build artifact      |
| A4                 | Medium   | One invalid AI tool registration breaks AI access for every member                                              | AI clients                              | Reproduced                               |
| D1                 | Medium   | Stored membership rows are not validated: one bad row can crash membership, a mistyped flag can grant ownership | All members; operators                  | Reproduced                               |
| D2                 | Medium   | No tested database recovery procedure                                                                           | All members                             | Reviewed; local rehearsal passed         |
| S10                | Medium   | Changing the Access team (a planned account move) locks out every member, including the owner                   | All members                             | Reproduced                               |
| C1                 | Medium   | An expired sign-in or network failure leaves stale data, a technical error and no way back                      | All signed-in people                    | Reproduced (harness)                     |
| C2                 | Medium   | Activity can look empty when loading it failed                                                                  | Administrators, auditors                | Reproduced (harness)                     |
| C3                 | Medium   | Allow and Revoke checkboxes have identical accessible names                                                     | Screen-reader administrators            | Reproduced (harness)                     |
| C4                 | Medium   | Keyboard focus is lost after common actions; phone errors appear off-screen                                     | Keyboard, screen-reader and phone users | Reproduced (harness)                     |
| C7                 | Medium   | One organization-wide revision makes unrelated edits fail and discards typed changes                            | Administrators, members                 | Reproduced (harness and data tests)      |
| C5, C6             | Low      | Sideways scrolling with long names or at 320 px; raw validation wording; small targets; faint borders           | Various                                 | Reproduced (harness)                     |
| S12, A5, D3, G2–G4 | Low      | Smaller issues listed in each section                                                                           | Various                                 | Mixed                                    |
| S11                | Status   | Personal AI sign-in not activated in production                                                                 | AI users                                | Confirmed                                |

## Findings: evidence, fix and check

Each entry gives what was observed and what was expected, the evidence, a focused fix, and how to confirm the fix. The [evidence appendix](https://github.com/sliceconsultingsu/slice-launcher/blob/test/readiness-evaluation-suites-2026-10-16/docs/evaluations/2026-10-16-platform-readiness-evidence.md) has fuller detail, including reproduction steps.

### Production and repository controls

**S1. A Write collaborator can merge their own PR, and merging deploys to production (High; confirmed from settings).**

- **Observed vs expected:** the documented rule is "Ivan reviews other contributors' PRs", but `main` requires 0 approvals and there is no `CODEOWNERS` file, no push restriction and no ruleset. One outside collaborator already has Write access. The `production` environment has no required reviewers, and a merged workflow change would run with the production Cloudflare token. `docs/security-review.md` already notes that this setting "does not technically prevent" self-merging.
- **Fix:** add `CODEOWNERS` and require one code-owner approval. Keep Ivan's own PRs working through a ruleset bypass for Ivan only.
- **Check:** a PR from a Write test account cannot merge without Ivan's approval.

**S2. Seven of the last ten releases failed verification and stayed live (High; reproduced from logs).**

- **Observed vs expected:** each failed run uploaded a new Worker version, then failed 2–5 seconds later with `Asset failed: /_next/static/... (404)`, a different file each time. No rollback ran, so production keeps serving unverified code. The newest version is `818e63d6` from `f1f1c4d` (inferred from logs); the last verified one is `296675a9` from PR #33.
- **Cause:** this matches Cloudflare's documented _version skew_, where a page from the new version asks an old version for a file it doesn't have. `scripts/check-launcher.mjs:79-87` fetches assets once with no retry, and no test covers an asset that is briefly missing. Real users may also briefly see broken pages after each release.
- **Fix:** let missing assets count as "still propagating" within the existing 30-second window, or verify the version on its preview URL before shifting traffic. Then define what happens when a check fails after release: automatic rollback to the last verified record, or an incident.
- **Check:** a 404-then-200 asset test passes, a permanent 404 still fails, and 10 consecutive releases pass.

**S7. A Write collaborator can roll production back without approval (Medium; confirmed from settings).**

- **Observed:** the `workflow_dispatch` rollback in `rollback.yml` uses the `production` environment, which has no reviewers.
- **Fix:** add Ivan as a required reviewer on `production`, or add an actor rule.
- **Check:** a rollback started by a Write account waits for approval.

**S8. Secret scanning, push protection and private vulnerability reporting are off (Medium; confirmed from settings).**

- **Observed:** all three are `disabled`, although `docs/security-review.md` says scanning and push protection are on. The October 14 move to the organization is the likely cause (not confirmed).
- **Fix:** re-enable all three, correct the guide, and add these settings to the transfer checklist.

**S9. The organization does not require two-factor authentication (Medium; confirmed from settings).**

- **Impact:** together with S1, a stolen password for a Write account is enough to ship to production.
- **Fix:** require 2FA for the organization.

**S10. Changing the Cloudflare Access team locks out every member, including the owner (Medium; reproduced).**

- **Observed:** stored identities are `${issuer}|${sub}` (`auth.ts:45`), and a known email cannot be bound to a new identity (`domain.ts:54-56`). After a team change, the owner sees `403 This email is already linked to a different identity.` A move to a Slice-owned account is planned.
- **Fix:** before that move, rehearse a reviewed rebinding migration on restored synthetic data.

### Shared app platform

**S3. Creating an app with the documented command makes the required tests fail (High; reproduced in a clean clone).**

- **Observed:** after `pnpm app:create demo "Demo"`, `pnpm test` and `pnpm test:coverage` report `1 failed`. `platform/src/lib/page.test.ts:10` expects the empty-catalog message. Every first app PR would start red, and the obvious workaround is editing a platform test.
- **Fix:** mock the catalog in that test, and add a CI test that scaffolds a temporary app and runs the full gate.
- **Check:** `app:create` followed by the gate exits 0.

**A1. App code can read the whole membership database, and no check notices (High while S1 is open; reproduced).**

- **Observed:** in the disposable probe app, an API handler loaded `Repository(env.MEMBERSHIP_DB)` through `cloudflare:workers` without any permission check. It passed lint, typecheck, tests and build, and returned every member's email to a member who held only `app.<id>.open`. `scripts/platform-apps.mjs:183-207` checks modules only for MCP SDK imports and `"use server"`, yet `docs/adding-an-app.md` says the app context "does not expose the membership database".
- **Fix:** make `check:platform` reject app imports of `cloudflare:workers`, membership internals and platform internals, plus non-literal dynamic imports.
- **Check:** the bypass fails lint.

**A2. A route added outside the three guarded folders ships with no membership check (Medium; reproduced locally).**

- **Observed:** `platform/app/api/<new>/route.ts` passed every check and returned data locally without a sign-in. `platform-apps.mjs:138-148` inspects only three folders. In production, Access would still require a sign-in, but not membership.
- **Fix:** allowlist the known route files, and add `CODEOWNERS` entries for `platform/app`, `platform/src`, `scripts`, `.github` and `wrangler.jsonc`.

**A3. Test code can change the release configuration before the build (Medium; reproduced up to the built artifact).**

- **Observed:** a test inside the app folder rewrote `platform/wrangler.jsonc`, and the change appeared in `dist/server/wrangler.json`. `validation.yml` runs tests and the build in one workspace and fingerprints only afterwards.
- **Fix:** fail the job if tracked files changed after tests, or build in a fresh checkout. Check the expected Worker name, bindings and variables in the artifact.

**A4. One invalid AI tool registration breaks AI access for every member (Medium; reproduced).**

- **Observed:** a tool whose `permission` is not declared in `app.json` passes CI. Afterwards every `/mcp` request, including `slice_apps` for owners, returns 500. `mcp.ts:37-59` validates the whole registry on each request, and platform tests use a mocked catalog.
- **Fix:** validate the real registry in CI, and at runtime skip only the offending app.

**A5. Smaller app findings (Low; reproduced).**

- Apps can set cookies on the shared origin, because `Set-Cookie` passes through dispatch.
- GET handlers that write, and tools marked read-only that write, pass CI.
- App tests are not required.
- Release smoke checks never probe `/apps` or `/api/apps`.

**What works (reproduced).** Through real dispatch, the MCP adapter, signature checks and D1, the probe app inherited:

- sign-in and current membership;
- an allowed action: GET with `app.open` returned 200;
- a denied action: POST without `records.edit` returned 403 and wrote nothing;
- immediate revocation;
- same-origin and size limits;
- MCP tool filtering;
- the single shared build, with no per-app deployment step or credential.

### Consultant and administrator journeys

These were checked in the synthetic browser harness at 1280, 375, 640 and 320 px wide, using keyboard-only scripts and axe (WCAG 2.0–2.2 A/AA). Onboarding, approval, invitations, levels, Allow/Revoke, delegated limits, suspension of an open session and stale-edit recovery all worked. Axe found no violations except one state (C5).

**C1. An expired sign-in or network failure leaves stale data, a technical error and no way back (Medium; reproduced in the harness).**

- **Observed:** the screen shows "Failed to fetch" or `Unexpected token 'S' … is not valid JSON` beside the old data, with no sign-in or retry control (`workspace.tsx:8-12, 33-34, 58-59`).
- **Fix:** give each failure kind a plain message and a **Sign in again** or **Try again** action, and hide stale private data.

**C2. Activity can look empty when loading it failed (Medium; reproduced).**

- **Observed:** a failed history load showed the error and "No activity to display." together. After **Reload latest changes** only the empty state remained, although 31 entries existed (`workspace.tsx:64-86, 346`).
- **Fix:** show the empty state only after a successful load.

**C3. Allow and Revoke checkboxes have identical accessible names (Medium; reproduced).**

- **Observed:** both read "View access history" (`editors.tsx:219-222`), so a screen-reader administrator cannot tell granting from revoking.
- **Fix:** add a `fieldset`/`legend` per column, or column-specific labels.

**C4. Keyboard focus is lost after common actions, and phone errors appear off-screen (Medium; reproduced).**

- **Observed:** after Continue, saving the profile, saving access, errors and loading Activity, focus falls back to the page body. On a 375 px screen, the duplicate-email error was 364 px above the visible area. Field errors lack `aria-describedby`.
- **Fix:** move focus to the status or alert, scroll errors into view, and associate errors with their fields.

**C7. One organization-wide revision makes unrelated edits fail, and the reload discards what was typed (Medium; reproduced).**

- **Observed:** an invitee's sign-in made the owner's **Create access level** fail with "Membership changed. Reload before saving.", and the reload lost the typed edit (`api.ts:64-65`, `domain.ts:37`). This is intentional and keeps data safe, but it will get worse during onboarding waves.
- **Fix:** check profile saves per member, skip saves that change nothing, keep typed input across the reload, and say the change was not saved.

**C5, C6. Smaller journey findings (Low; reproduced).**

- Long unbroken names cause sideways scrolling.
- At 320 px the account and Connect your AI headers clip.
- The expanded Activity detail is a scroll area keyboard users cannot reach (axe `scrollable-region-focusable`).
- Validation messages use library wording, for example `Too small: expected string to have >=1 characters`.
- One activity entry reads "By · ".
- Some targets are below the profile's 44 px.
- Input borders are about 1.5:1, below the 3:1 non-text contrast minimum (an already documented gap).
- Invitees are told "An administrator will review" although they are activated immediately.

### Data correctness and recovery

**What works (reproduced):**

- concurrent edits produced exactly one winner and one 409;
- replayed old requests were rejected;
- duplicate sign-ins and invitations were handled, including letter-case variants;
- failures injected mid-save left no partial state;
- every change produced one consistent audit row;
- running migrations twice changed nothing;
- a local export, wipe and restore of synthetic data reproduced the snapshot exactly.

**D1. Stored membership rows are not validated: one bad row can crash membership, and a mistyped flag can grant ownership (Medium; reproduced).**

- **Observed:** `Repository.load()` casts the stored JSON without checking it (`repository.ts:21-22`), and ownership is a truthiness check (`domain.ts:19`).
  - The text `"false"` in `owner`, an easy hand-SQL slip, gave a member every permission and let them suspend the real owner.
  - One `null` row returned 500 to everyone.
- **Fix:** validate rows with strict schemas. An invalid row should grant nothing, leave other members unaffected, and stay out of the owner count.

**D2. No tested database recovery procedure (Medium; documentation review and local rehearsal).**

- **Observed:** `docs/migrations.md` refers to "the documented D1 recovery mechanism", but no runbook exists. After a point-in-time restore, revision numbers repeat, so a tab opened on the discarded data could overwrite a newer change (HTTP 200 instead of 409). The docs correctly say a Worker rollback does not restore data.
- **Fix:** write and rehearse a runbook: freeze writes, record a Time Travel bookmark, restore, raise the revision, verify, name the operator and credential, and set rules for handling exports.

**D3. Smaller data findings (Low; reproduced).**

- Only the latest 50 activity entries are reachable, and they are ordered by clock time.
- A lost response after a successful save says "could not be loaded".

### AI reviewer and personal AI connections

**S4. The advisory reviewer is likely to be blocked from November 2, 2026 (Medium; reasoned from GitHub's documentation and live settings).**

- **Observed:** GitHub's default policy for public repositories blocks `pull_request_target` workflows from that date unless an Actions event policy allows them. `ai-review.yml` uses that trigger, and the repository has no Actions policies (`{"total_count":0}`). An organization-level policy could not be read.
- **Fix:** before November 2, add an event policy that allows the reviewer, together with an actor rule (this also addresses S6).

**S5. The review rarely completes on real PRs (Medium; reproduced).**

- **Observed:** final statuses for PRs #21–#34 were 2 completed, 9 incomplete, 2 failed and 1 still pending. On the current subscription route the rate is 2 of 8, and no final-head review published a finding. Deterministic probes through `scripts/ai-review/core.mjs` showed three things:
  - one mis-cited finding discards all valid findings (`failed [outside_diff]` or `[evidence_mismatch]`, nothing published);
  - fenced JSON fails `[output_schema]`, as in hosted PR #29;
  - a busy gateway (HTTP 429) is indistinguishable from an outage (`[provider_transport]`).
- **Fix:** publish the findings that pass, with a count of those rejected; accept one fenced JSON block; add a `provider_busy` category; track the completion rate.

**S6. Any GitHub user can spend the owner's review subscription (Medium; reasoned).**

- **Observed:** the review runs on `pull_request_target`, including the `edited` event, with no check of the author. Outside fork PRs are probably not held for approval. The gateway handles one request at a time, so outside use can also crowd out real reviews.
- **Fix:** limit runs to collaborators with an actor rule or an `author_association` check, and drop `edited`.

**S11. Personal AI sign-in is not active in production (status; confirmed).**

- **Observed:** `POST /mcp` returns 302 to the Access login, with `WWW-Authenticate: Cloudflare-Access …` rather than a Bearer challenge. The official `@modelcontextprotocol/client` 2.3.1 could not connect. Synthetic tests pass: role filtering, denied calls, and revocation before a call. This matches the "awaiting platform setup" guide.

### Contributor experience and documentation

**G1. Contributors cannot see their app, or any signed-in page, before production (High for app builders; reproduced).**

- **Observed:** locally, `/apps/<id>` redirects to `/account`, and **Sign in** returns raw `{"error":"Sign in to continue."}`. The browser test harness serves only account screens. The scaffolded README nevertheless says the app runs at `/apps/<id>`.
- **Fix:** add a documented local preview with a synthetic owner, kept out of production by the existing artifact guard.

**G2–G4. Documentation gaps (Low; reproduced).**

- No "fork or branch" guidance.
- The required check is not named in the contribution guide.
- Stale statements:
  - test counts in `docs/testing.md`;
  - the security settings and "sole maintainer" in `docs/security-review.md`;
  - the GPT-era policy sections in `docs/ai-review.md` sit at the same level as the current setup;
  - the deployment guide does not mention failing releases.
- Thin prerequisite setup: no `corepack enable`, `.nvmrc` or `--with-deps`.
- **Works well:** zero broken relative links or anchors in 46 files; clear guidance on where apps go; a clear current-versus-historical index; checks that take about 30 seconds.

### Low-severity items

- **Sign-in key outage message.** An outage of the sign-in key service says "Sign in again" (401) instead of "temporarily unavailable".
- **Undocumented dependency alert.** High-severity Dependabot alert #2 (`sharp`, in local test tooling) is not in the security guide.
- **Review stuck pending.** PR #23's review comment never left "pending".
- **Local `/mcp` failures under load.** 5 of 1,500 parallel requests failed inside Wrangler's local proxy. The cause was not established, and production was not tested.
- **Scaling.** At 1,000 synthetic members an administrator's view is 264 KB and took 7.9 ms locally, which is not a near-term risk.

## The five most valuable next actions

Each action names the findings it closes and what "done" means. Actions 1 and 2 protect production and should come before inviting more contributors. Action 3 is the gate for the first business app.

1. **Enforce maintainer review and harden the repository** (S1, S7, S8, S9, A2).
   **Done when:**
   - a pull request from a Write test account shows "Review required" and cannot be merged until Ivan approves;
   - Ivan's own PRs still merge through the ruleset bypass;
   - a rollback started by a Write account waits for Ivan's approval;
   - `CODEOWNERS` covers `platform/app`, `platform/src`, `scripts`, `.github` and `platform/wrangler.jsonc`;
   - the organization requires two-factor authentication;
   - secret scanning, push protection and private vulnerability reporting are enabled;
   - `docs/security-review.md` describes the actual settings, checked through the API.
2. **Make release verification reliable, and never leave an unverified release serving traffic** (S2).
   **Done when:**
   - the post-release check tolerates an asset that is briefly missing during the existing 30-second rollout window and still fails when an asset stays missing (both cases tested);
   - the chosen policy for a failed check, automatic rollback to the last verified record or verifying the version's preview URL before routing traffic, is implemented and tested;
   - 10 consecutive releases to production pass;
   - the version serving production now has been re-verified with the service identity.
3. **Make the first app PR succeed safely** (S3, G1, A1, A3, A4, A5).
   **Done when:**
   - CI runs `pnpm app:create` for a temporary app followed by the full gate, and it passes;
   - a newcomer can open `/apps/<id>` locally as a synthetic owner by following the README, and the release artifact check still rejects the harness;
   - the A1 and A2 bypass variants fail `pnpm lint` with a named rule;
   - validation fails if tests modify tracked files;
   - the real app registry's AI tools are validated in CI, and a bad registration affects only its own app;
   - a platform test asserts denial for every registered app.
4. **Keep the advisory reviewer running and make its results usable** (S4, S5, S6).
   **Done when:**
   - before November 2, a repository Actions event policy allows the reviewer's `pull_request_target` workflow and an actor rule limits it to collaborators;
   - a PR from an outside fork triggers no provider call, and editing a PR description does not start a review;
   - findings that pass validation are published even when another finding is rejected (status not "completed");
   - a fenced JSON answer is accepted;
   - "busy" has its own category;
   - over the next 10 ordinary PRs, completed, incomplete and failed outcomes are recorded;
   - with the owner's approval, the six new held-out cases from this evaluation are run through the live route, scored by a human, and reported with their limits.
5. **Validate stored data and rehearse recovery before any hand edit or account move** (D1, D2, S10).
   **Done when:**
   - `Repository.load()` validates rows, invalid rows grant nothing and do not affect others, and the `known defect` tests in `platform/tests/evaluation/malformed.test.ts` are converted to passing tests;
   - a one-page recovery runbook exists (freeze writes, Time Travel bookmark, restore, raise the revision, verification queries, operator and credential, export handling) and has been rehearsed once on a disposable remote D1 database;
   - an identity-rebinding procedure for an Access team change has been rehearsed on restored synthetic data.

After these, activate personal AI sign-in by following `docs/mcp.md#activate-remote-sign-in` with one approved client (S11). Record the client and version, and repeat the denied, revoked, suspended and service-identity checks against production.

## Test matrix

**Passed:** behaved as expected. **Failed:** a defect or gap, with the finding referenced. **Unverified:** could not be tested, and why. **Not applicable:** does not apply to the current release.

| Area                                   | Passed | Failed | Unverified |   N/A |
| -------------------------------------- | -----: | -----: | ---------: | ----: |
| A. Identity, permissions, privacy      |     11 |      1 |          1 |     1 |
| B. Contribution and release            |      7 |      6 |          1 |     0 |
| C. Journeys and accessibility          |     10 |      9 |          2 |     0 |
| D. Shared app inheritance              |      9 |      6 |          0 |     1 |
| E. Personal AI / MCP                   |      4 |      2 |          1 |     1 |
| F. Data and recovery                   |      7 |      4 |          1 |     1 |
| G. Contributor experience              |      4 |      4 |          0 |     0 |
| H. Reliability, performance, AI review |      7 |      8 |          1 |     0 |
| **Total**                              | **59** | **40** |      **7** | **4** |

**Failed, unverified and not applicable rows:**

| Area | Scenario                                                                        | Result         | Evidence                                                                           |
| ---- | ------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| A    | Access team change preserves members                                            | Failed         | S10: everyone, including the owner, locked out                                     |
| A    | Real Google sign-in and Access policy in production                             | Unverified     | no member account; site is Access-protected                                        |
| A    | Isolation between organizations                                                 | Not applicable | one organization by design                                                         |
| B    | Maintainer review required for Write collaborators                              | Failed         | S1: 0 approvals, no CODEOWNERS, Write collaborator present                         |
| B    | Rollback limited to maintainers                                                 | Failed         | S7: any Write account can dispatch                                                 |
| B    | Post-release verification reliable                                              | Failed         | S2: 7 of last 10 failed on asset 404 after upload                                  |
| B    | Failed release leaves production on a verified version                          | Failed         | S2: no rollback; version 818e63d6 left serving (inferred)                          |
| B    | Live rollback                                                                   | Unverified     | never run successfully; two October 4 attempts failed; not exercised               |
| B    | Secret scanning, push protection, private vulnerability reporting               | Failed         | S8: all disabled                                                                   |
| B    | Organization two-factor requirement                                             | Failed         | S9                                                                                 |
| C    | Plain-language validation errors tied to fields                                 | Failed         | C6: raw library wording, no aria-describedby                                       |
| C    | Server, network and expired-session errors                                      | Failed         | C1                                                                                 |
| C    | Activity view after a load error                                                | Failed         | C2: false empty log                                                                |
| C    | Stale revision message and recovery                                             | Failed         | C7: unrelated edits fail; typed edit lost                                          |
| C    | Allow/Revoke accessible names                                                   | Failed         | C3                                                                                 |
| C    | Keyboard focus after save, error and tab load                                   | Failed         | C4                                                                                 |
| C    | Errors visible on phones                                                        | Failed         | C4: alert 364 px above viewport                                                    |
| C    | Long unbroken names; 320 px reflow                                              | Failed         | C5                                                                                 |
| C    | Input boundary contrast 3:1                                                     | Failed         | C6: known gap already documented                                                   |
| C    | Sign out                                                                        | Unverified     | harness has no sign-out route                                                      |
| C    | Screen reader announcements; Safari, Firefox and real devices                   | Unverified     | not available in this evaluation                                                   |
| D    | Full documented gate with an app present                                        | Failed         | S3: page.test.ts fails                                                             |
| D    | Guardrail: app reads membership database directly                               | Failed         | A1: ships                                                                          |
| D    | Guardrail: route outside guarded folders                                        | Failed         | A2: ships, returns data without sign-in locally                                    |
| D    | Guardrail: test code alters release config                                      | Failed         | A3: change reaches dist                                                            |
| D    | Guardrail: undeclared tool permission                                           | Failed         | A4: ships; /mcp 500 for everyone                                                   |
| D    | Guardrail: GET that writes, read-only tool that writes, Set-Cookie              | Failed         | A5: ship (Low)                                                                     |
| D    | Record-level rules in a real business app                                       | Not applicable | no business apps exist; the probe used in-memory records                           |
| E    | Production OAuth discovery (Bearer challenge, protected-resource metadata)      | Failed         | S11: 302 to login with Cloudflare-Access header; activation pending, as documented |
| E    | Browser sign-in, initialize, list and permitted call in an approved real client | Unverified     | blocked: managed OAuth not activated                                               |
| E    | Official MCP client connection attempt (unauthenticated)                        | Failed         | S11: @modelcontextprotocol/client 2.3.1 refuses login redirect                     |
| E    | App tools exposed in production                                                 | Not applicable | catalog empty; only slice_apps exists                                              |
| F    | Older audit history reachable                                                   | Failed         | D3: latest 50 only                                                                 |
| F    | Malformed stored rows fail safe                                                 | Failed         | D1: crash or ownership                                                             |
| F    | Upgrade migration that changes the schema                                       | Not applicable | only migration 0001 exists                                                         |
| F    | Stale tab rejected after point-in-time restore                                  | Failed         | D2: revision reuse                                                                 |
| F    | Documented recovery runbook                                                     | Failed         | D2                                                                                 |
| F    | Cloudflare Time Travel restore                                                  | Unverified     | remote-only; not authorized                                                        |
| G    | Local sign-in or signed-in preview                                              | Failed         | G1                                                                                 |
| G    | Scaffold, then documented checks                                                | Failed         | S3                                                                                 |
| G    | Contribution guide covers fork/branch, reviewers, required checks               | Failed         | G2                                                                                 |
| G    | Current guides match implementation and settings                                | Failed         | G3                                                                                 |
| H    | Local /mcp under parallel load                                                  | Failed         | S12: 5 of 1,500 failed in local proxy; cause not established                       |
| H    | Sign-in key service unavailable                                                 | Failed         | S12: tells user to sign in again                                                   |
| H    | Advisory review completes on ordinary PRs                                       | Failed         | S5: 2 of 8 on subscription route                                                   |
| H    | Reviewer keeps valid findings when one is invalid                               | Failed         | S5 probe                                                                           |
| H    | Reviewer distinguishes busy from unavailable                                    | Failed         | S5 probe                                                                           |
| H    | Interrupted review finalizes its status                                         | Failed         | S12: PR #23 stuck pending                                                          |
| H    | Reviewer usage limited to trusted authors                                       | Failed         | S6                                                                                 |
| H    | Reviewer keeps running after November 2, 2026                                   | Failed         | S4 (reasoned)                                                                      |
| H    | Reviewer detection on new known-defect and clean cases (live)                   | Unverified     | credential access blocked; six cases prepared                                      |

**Passed rows, by area:**

- **A.** Unsigned, forged, wrong-audience, expired and service identities rejected (membership, app page/API, MCP); Owner has full authority, labelled Admin (owner); Delegated admin cannot exceed or edit its own authority (10 cases); Activity reviewer sees history only; Admin label only for manage permissions; Ordinary member directory hides emails and non-active members; Pending, invited, suspended and unknown people cannot use admin, apps or MCP; Suspension and individual Revoke apply to the next request with the same sign-in; Last active owner cannot be removed or suspended; Changed email or a second account cannot take over a membership; email case ignored; Cross-user edits by ordinary members refused; Permission tests detect injected authorization bugs.
- **B.** Required check `validate` on main, strict, pinned to GitHub Actions; PR code cannot read production or model credentials; Production credentials limited to protected main; Exact validated artifact promoted; verified record only on success; Rollback mechanics (isolated fixtures); Security scanning gate (CodeQL, dependency review) runs and blocks; External Actions pinned to commit SHAs.
- **C.** Onboarding, pending limits, owner approval, profile persistence; Pending person: own profile only; history, add and level calls refused; empty directory; Invite, then invitee sign-in becomes active; custom level; Allow and Revoke take effect; Delegated administrator meets locked and forbidden actions; Suspension while the member's page is open; Invalid, overlong and duplicate input rejected; Keyboard: skip link, every control operable, no trap; No sideways scroll at 1280, 375 and 640 px with typical data; axe WCAG 2.0–2.2 A/AA on about 60 states; Reduced motion.
- **D.** Scaffold creates module and registers catalog; App inherits login and current membership (deny paths); Allowed action (GET with app.open) and denied action (POST without records.edit); Immediate revocation of an app action; App MCP tools filtered and re-checked on call; Compiled Worker denies app page/API and /mcp without valid sign-in; One shared build and release; no per-app deploy step or credential; Guardrail: server action, MCP SDK import, client import of server code, wrangler.jsonc/package.json in module; Undeclared action at runtime fails closed.
- **E.** Synthetic: initialize, list and call with role-based filtering; Synthetic: denied calls and revocation between list and call; CI service identity rejected at /mcp in production; CI reviewer credential separate from personal identity.
- **F.** Concurrent edits: one winner, loser 409, audit matches; Stale replay rejected; Duplicate sign-ins and invitations; Failed writes leave no partial state; Audit consistency (one row per change, before/after match); Migrations idempotent; ledger compatible with Wrangler; Local export and restore of synthetic data.
- **G.** Frozen install from a clean clone; Local dev starts; health works; Relative links and anchors (46 Markdown files); External links (38).
- **H.** Documented gate on main (format, lint, typecheck, tests, coverage, migrations, browser, build, smoke); Local load: 300 requests at 10 concurrent per route; Membership database unavailable; Missing Access configuration; Scaling to 1,000 members; Advisory review shows honest status (green job is not a completed review); New commits make earlier review stale.

The full row-by-row matrix is in the [evidence appendix](https://github.com/sliceconsultingsu/slice-launcher/blob/test/readiness-evaluation-suites-2026-10-16/docs/evaluations/2026-10-16-platform-readiness-evidence.md#test-matrix) and the [JSON results](https://github.com/sliceconsultingsu/slice-launcher/blob/test/readiness-evaluation-suites-2026-10-16/docs/evaluations/2026-10-16-platform-readiness.json).

## Scenarios the existing tests miss

These are covered by the evaluation suite or listed as next actions:

- **App scaffolding.** An app registered in the real catalog, run through the full gate (S3). Real-registry MCP validation (A4).
- **App boundary.** Server imports from apps into platform internals, and routes outside the guarded folders (A1, A2).
- **Workspace integrity.** Tracked files modified by tests before the release build (A3).
- **Release propagation.** An asset briefly missing during rollout (S2).
- **Stored data.** Malformed or wrongly typed stored rows (D1). Revision reuse after a point-in-time restore (D2).
- **Identity.** An Access team or issuer change (S10). Sign-in key retrieval failure (S12).
- **AI reviewer outputs.** A mixed valid and invalid finding set, fenced JSON and a busy gateway (S5).
- **Role coverage.** The full role-by-operation matrix across the membership API, an app page and API, and MCP, including the activity-reviewer role.

## Reusable tests and evidence

- **Proposed in [PR #35](https://github.com/sliceconsultingsu/slice-launcher/pull/35):** [`platform/tests/evaluation/`](https://github.com/sliceconsultingsu/slice-launcher/blob/test/readiness-evaluation-suites-2026-10-16/platform/tests/evaluation/README.md). It contains an evaluation-only Vitest suite (61 passing tests and 5 expected failures that document known defects), the browser journey suite, and a local-only D1 rehearsal. It does not join CI.
- **Kept outside Git on the evaluator's machine:** the disposable `evalprobe` app and its bypass variants, the six held-out reviewer cases, the deterministic reviewer probes, the load scripts, 88 synthetic screenshots and raw logs. None of it contains credentials or private data. The evaluation app is deliberately not merged.

## Limits of this evaluation

- **Not exercised:**
  - real Google sign-in;
  - the Cloudflare Access policy as members experience it;
  - any action by a second real GitHub account;
  - live rollback;
  - Cloudflare Time Travel;
  - a production database read.

  Settings were inspected read-only. The evaluator held no Slice member account.

- **Live version is inferred.** The version serving production was taken from workflow logs, not confirmed in Cloudflare.
- **Synthetic, local test environment.** Permission, data and app tests run the real code with local Miniflare D1 and locally signed identities. They show how the code behaves, not how Cloudflare's edge, real D1 latency or several Worker instances behave.
- **Load was modest and local only.** No load was sent to production. Production latency was not measured.
- **The live AI-reviewer accuracy run was not performed.** Reading the reviewer credential on the development machine was blocked by the evaluator's safety controls. Reviewer conclusions rest on hosted PR history and deterministic probes.
- **Accessibility checks are automated plus keyboard scripts.** No screen reader was used.
- **Not a proof of security.** Passing automated checks do not mean the platform is secure, free of bugs or production-ready. This report records the evidence gathered on one day.
