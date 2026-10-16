# Slice platform readiness evaluation — evidence appendix (October 16, 2026)

This appendix holds the full evidence behind the [readiness report](2026-10-16-platform-readiness.md): per-finding detail, reproduction notes and the complete test matrix.

**Type:** historical evaluation report. It records what was tested on one day against one revision and is not current setup guidance. It changes no production setting.
**Machine-readable results:** [2026-10-16-platform-readiness.json](2026-10-16-platform-readiness.json).
**Reusable tests:** [platform/tests/evaluation/](../../platform/tests/evaluation/README.md).

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

## Finding details

### Repository, release, identity and AI connection

### S1. A Write collaborator can merge their own pull request, and merging deploys to production

- **Severity:** High. **Status:** confirmed from live GitHub settings; a merge by a Write account was not performed.
- **Who and where:** any repository collaborator with Write access (one exists today); GitHub `main` and the `production` environment.
- **Business impact:** the documented rule is "Ivan reviews other contributors' PRs". GitHub does not enforce it. Once `validate` passes and conversations are resolved, a Write collaborator can merge their own change. The merge automatically releases to production. Because a merged workflow runs with the production Cloudflare token, a merged workflow change could also use that token. Mistakes or a compromised account can therefore reach production without human review.
- **Evidence (read-only API, 2026-10-16):** `branches/main/protection` reports `required_approving_review_count: 0`, `require_code_owner_reviews: false`, no push restrictions and no rulesets. There is no `.github/CODEOWNERS`. `collaborators` lists one outside collaborator with `write`. The `production` environment has only a branch policy and no required reviewers, with `SLICE_LAUNCHER_DEPLOY_ENABLED=true`. `docs/security-review.md` already records the gap: "does not technically prevent a future write collaborator merging their own PR. Revisit permissions before adding write maintainers."
- **Expected vs observed:** expected a required maintainer approval for non-maintainer PRs. Observed zero required approvals with a Write collaborator present.
- **Fix:** add `CODEOWNERS` (`* @ichen27`) and require one code-owner approval. Keep Ivan's own-PR workflow with a branch ruleset whose bypass list contains only Ivan (or the Repository admin role). Also add Ivan as a required reviewer on the `production` environment, or an Actions actor rule, so a Write collaborator cannot dispatch a rollback (S7).
- **Verify:** `gh api repos/sliceconsultingsu/slice-launcher/rules/branches/main` shows the review rule and bypass actor. A PR from a Write test account shows "Review required" and cannot be merged. Ivan's own PR still merges.

### S2. Most recent production releases fail verification, and the failed release stays live

- **Severity:** High. **Status:** reproduced from workflow logs. Root cause is a reasoned diagnosis. The live version is inferred from logs and was not confirmed in Cloudflare.
- **Who and where:** everyone using production; the `Deploy launcher` workflow.
- **Business impact:** 7 of the last 10 releases to production uploaded a new Worker version and then failed the post-release check. The workflow does not roll back, so production keeps serving a version that never passed verification. The newest is version `818e63d6` from `f1f1c4d`; the last verified version is `296675a9` from `f304a50` (PR #33). Repeated red releases train people to ignore them. "Merged" also stops meaning "verified live".
- **Evidence:** runs 38840089613, 38839853836, 38839340570, 38832665722, 38832386971, 38831040156 and 38829912971. Each logs `Current Version ID`, then fails 2–5 seconds later with `Asset failed: /_next/static/...` (404) after the health check already reported the new release. A different file fails each time, and an identical rerun of #25 (`01ea64d`) passed. `scripts/check-launcher.mjs:79-87` fetches each asset once with no retry. Only `/api/health` and the protected routes retry during rollout (`:31-59`, `:117-123`). The test `fails a release when health works but a page asset is missing` locks in the no-retry behavior. No test covers an asset that is briefly missing during rollout and then appears.
- **Expected vs observed:** expected a reliable release gate that either verifies the live version or leaves production on a verified one. Observed a timing-sensitive check, with the failed version left serving traffic.
- **Likely cause:** Cloudflare documents this as _version skew_: requests are routed to a version independently, so a page from the new version can ask for a content-hashed file that an old version answering the next request does not have (Cloudflare Workers docs, "Gradual deployments → Version affinity / Version skew"). The same skew can briefly show real users an unstyled or broken page right after each release.
- **Fix:** keep the strict check, but treat an asset 404 during the same bounded 30-second rollout window as "still propagating", as is already done for health. Better still, verify the uploaded version on its own preview URL before shifting traffic (`wrangler versions upload --preview-alias …`, then `versions deploy`), and consider Cloudflare's version affinity for users. Separately, decide what happens when a check fails after release: roll back automatically to the last verified record, or open an incident.
- **Verify:** add a test where an asset returns 404 once and then 200, and confirm it passes. Confirm a permanently missing asset still fails. Then require 10 consecutive green production releases. Re-verify current production health with the service identity (operator task).

### S3. Creating an app with the documented command makes the required tests fail

- **Severity:** High for app builders. **Status:** reproduced (clean clone, `pnpm app:create demo "Demo"`).
- **Business impact:** every first app PR, including the planned alumni directory, starts with a red required check. Making it green means editing a platform test outside the contributor's folder. That is exactly the kind of check-weakening AGENTS.md forbids, and new contributors or their agents are likely to try it.
- **Evidence:** `platform/src/lib/page.test.ts:10` expects "No apps have been added yet" and renders the real catalog. After scaffolding, `pnpm test` and `pnpm test:coverage` report `1 failed | 66 passed`. The October 15 probe app was type-checked and built but never run through the tests (`docs/platform-validation-2026-10-15.md`).
- **Fix:** mock the catalog in `page.test.ts` (one empty case, one with an app). Add a CI tooling test that scaffolds a temporary app and runs the suite.
- **Verify:** in a clean clone, `pnpm app:create demo "Demo" && pnpm test && pnpm test:coverage` exits 0.

### S4. The advisory AI reviewer is likely to stop running on November 2, 2026

- **Severity:** Medium (time-bound). **Status:** reasoned from current GitHub documentation and live repository settings. No organization-level policy could be checked.
- **Business impact:** the contributor loop in `docs/ai-review.md` depends on the review comment. GitHub documents a default policy for public repositories that blocks `pull_request_target` workflows and says enforcement starts November 2, 2026, unless an applicable Actions event policy exists. This repository is public and `ai-review.yml` runs on `pull_request_target`.
- **Evidence:** `gh api repos/sliceconsultingsu/slice-launcher/actions/policies` returns `{"total_count":0,"policies":[]}`. The organization policy endpoint needs the `admin:org` scope, which the session token lacks, so it was not read. GitHub source: "Securely using pull_request_target → Default policy" (docs.github.com).
- **Fix:** before November 2, review **Settings → Actions → Policy insights**. If the reviewer is kept, add a repository event policy that allows `pull_request_target` only for this workflow's purpose. Pair it with an actor rule that limits who can trigger it (this also fixes S6).
- **Verify:** after November 2, a same-repository PR still receives a fresh advisory comment, and policy insights show no blocked runs.

### S5. The advisory review rarely completes on real PRs

- **Severity:** Medium. **Status:** reproduced (hosted results and deterministic probes).
- **Business impact:** consultants are told to read the fresh review and fix supported findings. In practice they usually receive "incomplete" or "failed", so the review gives little help while costing allowance and attention.
- **Evidence:** among PRs #21–#34, the final advisory status was completed for 2 (#33, #34), incomplete for 9, failed for 2 (#24 configuration, #29 `output_schema`) and stuck at pending for 1 (#23). On the subscription route (#27–#34) 2 of 8 completed. No final-head review published a finding. Deterministic probes through `scripts/ai-review/core.mjs` with simulated gateway answers (no network) showed:
  - one valid finding plus one finding citing an unchanged line gives `failed [outside_diff]` and publishes nothing, so the valid finding is lost;
  - one valid finding plus a whitespace-different citation gives `failed [evidence_mismatch]`, again with nothing published;
  - JSON wrapped in a Markdown code fence gives `failed [output_schema]` (consistent with the hosted #29 failure);
  - a busy gateway (HTTP 429) and an unreachable gateway both give `failed [provider_transport]`, so a consultant cannot tell "wait and retry" from "outage";
  - a truncated answer and a different echoed model are rejected, as designed.
- **Fix:** keep strict evidence checks per finding, but publish the findings that pass, together with a count of rejected ones and a non-"completed" status. Accept a single fenced JSON block. Map HTTP 429 to a distinct `provider_busy` category. Track the completion rate as an operating measure.
- **Verify:** extend `scripts/ai-review.test.mjs` with the probe cases above. Over the next 10 ordinary PRs, record completed / incomplete / failed counts.

### S6. Any GitHub user can spend the owner's review subscription

- **Severity:** Medium. **Status:** reasoned from workflow source and GitHub semantics; not exercised with an outside account.
- **Business impact:** the reviewer runs on the owner's personal subscription through the Mac mini gateway, which handles one request at a time. On a public repository anyone can open PRs. GitHub documents fork approval as applying to `pull_request` events, while `pull_request_target` runs in the trusted base-branch context, so these review runs are probably not held for approval. That point was not tested with an outside account. The workflow also re-runs on `edited`, so changing a PR description triggers another review. Outsiders can use up allowance and make legitimate reviews report busy or fail.
- **Evidence:** `.github/workflows/ai-review.yml:4-6` (`types: [opened, synchronize, reopened, edited, ready_for_review]`) and no author or association check in `scripts/ai-review/` (searched for `author_association`). The gateway returns `429 provider_busy` when a request is already running (`subscription-api/src/providers.mjs:130`).
- **Fix:** use Actions actor rules, or a first step that checks `author_association` in `OWNER/MEMBER/COLLABORATOR`, so the reviewer runs only for trusted authors. Drop `edited`, or limit it to base-branch changes. Rely on manual dispatch for outside PRs.
- **Verify:** a PR from a non-collaborator fork gets no provider call. Editing a PR description does not start a review.

### S7. A Write collaborator can roll production back without approval

- **Severity:** Medium. **Status:** confirmed from settings; not exercised.
- **Business impact:** production recovery is an owner decision, as the release documentation says, but anyone with Write access can run **Roll back launcher** from `main`. Rollback is limited to previously verified releases, so the damage is bounded. It can still reintroduce a fixed defect or interrupt an incident response.
- **Evidence:** `.github/workflows/rollback.yml` uses `workflow_dispatch` with `environment: production`. That environment has no required reviewers. GitHub's default is that every user with write access can trigger workflows.
- **Fix:** add a required reviewer (Ivan) to `production`, or an actor rule restricting `workflow_dispatch` on this workflow to admins.
- **Verify:** a dispatch by a Write account waits for approval.

### S8. Secret scanning and push protection are off, although the security guide says they are on

- **Severity:** Medium. **Status:** confirmed from settings.
- **Business impact:** this is a public repository with a growing contributor base. Push protection is the safety net that blocks a pasted credential before it becomes public.
- **Evidence:** `gh api repos/sliceconsultingsu/slice-launcher --jq .security_and_analysis` returns `secret_scanning: disabled` and `secret_scanning_push_protection: disabled`. `docs/security-review.md:5` says both "were already enabled on inspection (2026-10-04)". The repository moved to the organization on 2026-10-14. That before/after comparison did not cover these settings, so the transfer is the likely cause (unconfirmed). Private vulnerability reporting is also disabled (`{"enabled": false}`), although `CONTRIBUTING.md` offers it.
- **Fix:** re-enable secret scanning, push protection and private vulnerability reporting. Correct the guide. Add these settings to any future transfer checklist.
- **Verify:** the API shows `enabled`, and a test push of a known test-token pattern is blocked.

### S9. Organization accounts do not require two-factor authentication

- **Severity:** Medium. **Status:** confirmed from settings.
- **Business impact:** with S1, a stolen password for an account with Write access is enough to ship to production.
- **Evidence:** `gh api orgs/sliceconsultingsu` returns `two_factor_requirement_enabled: false`.
- **Fix:** require 2FA for the organization. Outside collaborators must also enable it.
- **Verify:** the organization API reports `true`.

### S10. Changing the Cloudflare Access team locks everyone out, including the owner

- **Severity:** Medium (planned ownership move). **Status:** reproduced with synthetic identities.
- **Business impact:** `docs/deployment.md` plans to move the platform into a Slice-owned Cloudflare account. Stored identities include the Access issuer, so after a team change every existing member, including the owner, arrives as a different identity and is refused. The docs mention an "operator recovery procedure", but none exists or has been tested.
- **Evidence:** `platform/src/membership/auth.ts:45` builds `${issuer}|${sub}`, and `domain.ts:54-56` refuses to rebind an email. The test "locks out every existing member, including the owner, if the Access team domain changes" in `platform/tests/evaluation/permission-matrix.test.ts` shows `needsEnrollment` and then `403 This email is already linked to a different identity.`
- **Fix:** before any account move, write and rehearse a reviewed rebinding migration (map old to new subjects by verified email, with an audit row) on a restored copy of the data.
- **Verify:** a rehearsal on disposable data lets the owner and members sign in under the new team, with an audit record for each rebinding.

### S11. Personal AI connections are not available in production

- **Severity:** readiness status, not a defect. **Status:** confirmed by an unauthenticated probe with the official MCP client.
- **Evidence:** `POST /mcp` returns 302 to the Access login page with `WWW-Authenticate: Cloudflare-Access resource_metadata=…`, not a `Bearer` challenge. `@modelcontextprotocol/client` 2.3.1 refuses the redirect and cannot connect. This matches `docs/connect-your-ai.md` ("awaiting platform setup"). Synthetic tests pass: role filtering, denied calls and revocation before a call, through the real SDK and adapter.
- **Next step:** follow `docs/mcp.md#activate-remote-sign-in` with one approved client, recording its version, and repeat the denied and revoked checks against production.

### S12. Smaller issues

- **Sign-in key outage shows "Sign in again" (Low, reproduced).** If Cloudflare's signing keys cannot be fetched, `verifyIdentity` returns 401 "Your sign-in could not be verified. Sign in again." Users would loop through sign-in during an outage. Return 503 with a "temporarily unavailable" message when key retrieval fails.
- **New dependency alert not in the security guide (Low).** Dependabot #2, `sharp` < 0.35.5 (GHSA-wq5f-xc86-pv6w, high), arrives through `miniflare` in local test tooling, not the Worker bundle. A patched version exists. Update or override it, and record it alongside alert #1 (`braces`).
- **A review can stay "pending" forever (Low).** PR #23's final comment still says "pending". When a run is cancelled or fails before publishing, the comment is never finalized.
- **Intermittent local `/mcp` failures under parallel load (Low, local only).** 5 of 1,500 unauthenticated `POST /mcp` requests at 10 in parallel failed inside Wrangler's local proxy ("Network connection lost"), in bursts. There were 0 of 600 failures with one request at a time, and 0 of 1,500 for the same pattern against `/api/membership`. Cause not established; production impact unknown. Include `/mcp` in a staging soak test.
- **Scale (Info).** Every request loads the whole organization. At 1,000 synthetic members, an administrator's view is 264 KB and took 7.9 ms (p50) locally. This is not a near-term risk at Slice's size. Add pagination before the alumni directory reuses the pattern.

### Shared app platform

### A1. App code can read the whole membership database, and no check notices

- **Severity:** High while S1 is open (Medium once maintainer review is enforced). **Status:** reproduced with the disposable `evalprobe` app (never committed, merged or deployed).
- **Who and where:** every member's private data; any app module in production.
- **Business impact:** the guide says an app's context "does not expose the membership database or other members" (`docs/adding-an-app.md`). That is true of the context object, but app code can reach the database directly. One careless or AI-written handler could publish every member's email and status, or change membership rows, and every automated check stays green.
- **Evidence:** an API handler that lazily imports `cloudflare:workers` and calls `new Repository(env.MEMBERSHIP_DB).load()` without any permission check passes lint, typecheck, tests and build, and ships in `platform/dist`. A member holding only `app.evalprobe.open` received pending, active and suspended members' emails. `scripts/platform-apps.mjs:183-207` checks modules only for MCP SDK imports and `"use server"`. `scripts/check-architecture.mjs` checks client imports, not server imports from apps into platform internals.
- **Fix:** make `check:platform` reject imports from `platform/apps/**` of `cloudflare:workers`, of membership internals (`repository`, `api`, `auth`, `domain`) and of platform internals (`runtime`, `dispatch`, `access`, `mcp`), and reject non-literal dynamic imports. Allow the contracts, `mcp-tool` and `MembershipError`. Reword the guide: modules are trusted code, and the check is a guardrail, not a sandbox.
- **Verify:** both bypass variants fail `pnpm lint` with a named rule.

### A2. A route added outside the three guarded folders ships with no membership check

- **Severity:** Medium (high impact if one lands). **Status:** reproduced locally.
- **Evidence:** a new `platform/app/api/evalprobe-export/route.ts` passes every check. The compiled Worker returned data for requests with no, malformed or forged sign-in. `scripts/platform-apps.mjs:138-148` inspects only `app/apps`, `app/api/apps` and `app/mcp`. In production, Cloudflare Access still requires a sign-in. Any identity it admits, including any eligible university account that has not been approved and the CI service token, would reach such a route without a membership check. That last point is reasoned from the Access policy description.
- **Fix:** allowlist the known `platform/app` route files in `check:platform`, and add `CODEOWNERS` entries for `platform/app`, `platform/src`, `scripts`, `.github` and `platform/wrangler.jsonc`.
- **Verify:** the bypass fails `pnpm lint`.

### A3. Test code can change the release configuration before the build

- **Severity:** Medium. **Status:** reproduced up to the built artifact; the deployment step is reasoned from the workflows.
- **Evidence:** a test inside the app folder rewrote `platform/wrangler.jsonc`, and after `pnpm build` the change appeared in `dist/server/wrangler.json`. `validation.yml` runs tests and the release build in the same workspace and fingerprints only afterwards, so the deploy job would verify and ship the altered configuration. The test code is visible in the PR, but the configuration change is not.
- **Fix:** fail the job if `git status --porcelain` shows changes after tests, or build from a fresh checkout in a separate job. Have `release-artifact.mjs` assert the expected Worker name, bindings and variables.
- **Verify:** the tampering test makes validation fail.

### A4. One invalid AI tool registration breaks AI access for every member

- **Severity:** Medium. **Status:** reproduced.
- **Evidence:** a tool whose `permission` is not declared in `app.json` passes lint, typecheck, tests (unless the app has its own MCP tests) and build. Afterwards, `initialize`, `tools/list` and even `slice_apps` return HTTP 500 for every member, including owners. Browser APIs are unaffected. `platform/src/platform/mcp.ts:37-59` validates registrations on every request and throws for the whole adapter. The platform's own MCP tests use a mocked catalog, so they never see the real registry.
- **Fix:** validate the real registry in CI. At runtime, skip only the offending app's tools and log a specific event. Generate typed action IDs from `app.json`.
- **Verify:** the bad registration fails CI, and `slice_apps` keeps working.

### A5. Smaller app-platform findings

- **Rules the checks don't catch (Low, reproduced).**
  - App APIs can set cookies on the shared origin. Dispatch forces private caching but passes `Set-Cookie` through, including one that clears the sign-in cookie. Strip `Set-Cookie`, or allow only app-prefixed `__Host-` names.
  - A GET handler that writes, and a tool marked read-only that writes, both pass CI; the probe's cross-origin GET changed a record. This is a documented rule with no check. Add reviewer-checklist items, and consider a read-only context for GET.
  - A typo in an action name is caught only at runtime. It correctly returns 403, even for owners. Typed action IDs would catch it earlier.
- **App tests are not required (Low).** With all probe tests deleted, CI still passed (apart from S3). Coverage measures platform files only, and the release smoke checks never probe `/apps` or `/api/apps`. Require at least one test per app, and add a platform test that asserts denial for every registered app through the real registry.
- **What works (reproduced).** Through real dispatch, the MCP adapter, signature checks and D1, the probe inherited all of the following:
  - sign-in and current membership: unsigned, forged, wrong-audience, expired and service identities got 401; pending, invited, suspended, unknown and rebound identities got 403;
  - the allowed action: with only `app.evalprobe.open`, GET returned 200;
  - the denied action: POST without `records.edit` returned 403 and wrote nothing;
  - immediate revocation, with the very next request denied;
  - same-origin and size limits;
  - MCP tool filtering, and calls denied after revocation;
  - registration in the single shared build.

  The compiled Worker returned 401 for app APIs and `/mcp` and 307 to `/account` for app pages without a valid sign-in. No per-app deployment step or credential exists.

### Consultant and administrator journeys

These journeys ran in the synthetic browser harness, which uses the real account and launcher screens, the real membership API and signed synthetic identities. Each journey was checked at 1280×800, 375×812, 640px (equivalent to 200% zoom) and 320px reflow, with axe (WCAG 2.0–2.2 A/AA), keyboard-only scripts and layout measurements. No screen reader was used. Screenshots contain synthetic data only and are kept outside Git.

**What works.**

- **Onboarding.** Creating a profile, the limits on pending accounts, owner approval and saved profile edits all work.
- **Stale edits.** Two pages editing at once get a clear "reload" path, and no data is lost.
- **Delegated admins.** Locked and forbidden actions are explained.
- **Suspension.** Suspending someone while their page is open takes effect at once.
- **Page structure and axe.** Every screen has a skip link, a single page heading and a `main` landmark. Axe found no violations on the main states at desktop and phone width.
- **Keyboard.** There are no keyboard traps.

### C1. An expired sign-in or a network failure leaves stale data on screen with a technical error and no way back

- **Severity:** Medium. **Status:** reproduced in the harness; production Access timing is reasoned.
- **Who and where:** every signed-in person whose Cloudflare Access session expires while the page is open.
- **Business impact:** Access sessions expire routinely. When that happens, the next request is redirected to the Access login, which the page's background request cannot follow. The screen keeps showing the last data and reports "Failed to fetch", with no sign-in link. A server error that isn't JSON shows `Unexpected token 'S', "Synthetic "... is not valid JSON`.
- **Expected vs observed:** expected a plain message ("Your sign-in expired. Sign in again.") with a sign-in action, and the stale workspace hidden. Observed technical text, stale data and no way forward except a manual reload.
- **Fix:** in the account workspace's fetch helper, treat redirected or opaque responses, network failures and non-JSON errors as distinct states with plain messages and a **Sign in again** or **Try again** action. Hide private data after a failed refresh.
- **Verify:** the C7 scenarios in `ui-journeys.eval.spec.ts` show the plain messages and actions.

### C2. Activity can look empty when loading it failed

- **Severity:** Medium. **Status:** reproduced.
- **Business impact:** an administrator checking who granted access could conclude that nothing happened.
- **Evidence:** when the history request failed, the page showed the error **and** the empty state at the same time. After **Reload latest changes**, it showed only the empty state with no alert, although 31 entries existed on the server.
- **Fix:** show the empty state only after a successful load, and keep the error with a retry control until a load succeeds.
- **Verify:** the C7 history scenario.

### C3. Allow and Revoke checkboxes have identical accessible names

- **Severity:** Medium. **Status:** reproduced.
- **Business impact:** a screen-reader user changing someone's access hears "View access history" twice and cannot tell granting from revoking. In an access-control screen, that is a meaningful mistake to invite.
- **Evidence:** in the member editor, two checkboxes are named "View access history" (C2 journey).
- **Fix:** name each checkbox by column ("Allow: View access history", "Revoke: View access history"), or group each column with a `fieldset` and `legend`.
- **Verify:** every checkbox has a unique accessible name.

### C4. Keyboard focus is lost after common actions

- **Severity:** Medium. **Status:** reproduced with keyboard-only scripts.
- **Evidence:**
  - After **Continue**, saving a profile, saving access, opening Activity and a duplicate-email error, focus falls back to the page body, so keyboard and screen-reader users lose their place.
  - Focus outlines on the section tabs are clipped by the tab row.
  - On phones, the duplicate-email error appears above the visible area (364px above the viewport), so the person does not see it.
- **Fix:**
  - after each action, move focus to the result notice or error, using the existing `role="status"` and `role="alert"` regions as targets;
  - keep the outline visible inside the tab row;
  - scroll errors into view;
  - associate field errors with `aria-describedby` and `aria-invalid`, which are currently absent.
- **Verify:** the C8 keyboard checks pass.

### C5. Long names and narrow screens cause sideways scrolling

- **Severity:** Low. **Status:** reproduced.
- **Evidence:**
  - A long name or email makes the member editor and profile scroll sideways at desktop, phone and 200% zoom, although the design profile requires names and emails to wrap.
  - At 320px wide (WCAG 2.1 AA reflow), the account and Connect your AI pages scroll sideways and the header's **Applications** link is clipped. The compact header rule only applies to pages with the account navigation (`globals.css:568`).
  - A realistic long hyphenated email does wrap; the problem is long unbroken strings.
  - An expanded activity entry contains a scrollable code block that keyboard users cannot reach. Axe reports `scrollable-region-focusable` (serious) on phone width.
- **Fix:** apply `overflow-wrap: anywhere` to names and emails in the editor and profile, let the header wrap below 360px, and make the activity details block focusable (`tabindex="0"`) or wrap it.
- **Verify:** C9 shows no sideways scroll at 320px and no axe violations.

### C7. One organization-wide revision makes unrelated edits fail, and the reload discards what was typed

- **Severity:** Medium (grows with the team). **Status:** reproduced in the browser and in the data tests.
- **Evidence:**
  - An invitee signing in made the owner's **Create access level** fail with "Membership changed. Reload before saving."
  - An unrelated invitation made a member's own profile save fail.
  - After reloading, the typed edit was gone ("Managing director" reverted to "Managing partner"), and the message does not say the edit was lost.
- **Cause:** `platform/src/membership/api.ts:64-65` requires the single organization revision to match for every command, and `domain.ts:37` increments it on every change, including sign-in. The editors are keyed by revision (`workspace.tsx:211, 278, 281, 326`). `docs/membership.md` documents the global revision as intentional; the data stays safe.
- **Fix:**
  - keep the organization-wide check for access changes, but check a member's own profile save against that member's record;
  - skip saves that change nothing;
  - keep the person's input across the reload;
  - say plainly that the change was not saved.
- **Verify:** rerun the C2 and C4 journeys and the data suite's scenario 7.

### C6. Smaller journey findings

- **Raw validation messages (Low, reproduced).** Several errors expose library wording, such as `Too small: expected string to have >=1 characters`, instead of a plain next step ("Enter a name"). Map validation issues to plain field messages.
- **Blank activity entry (Low, reproduced).** The first entry for a person who signed in before entering a name reads "By · ". Fall back to the email or "New member".
- **Small targets (Low, reproduced).** **Reload latest changes** is 21px tall, below the 24px minimum in WCAG 2.2. Section tabs are 38px, below the profile's 44px touch target.
- **Faint input borders (Low, already documented).** About 1.5:1, below 3:1 for input boundaries. This is listed under the design profile's known gaps.
- **Invitation copy (Low, reproduced).** The onboarding text tells everyone "An administrator will review your access", but invited people become active immediately.
- **Missing safeguards (Low, reasoned).** Granting ownership is a plain checkbox with no confirmation. Disabled checkboxes for a delegated administrator give no reason.
- **Test-harness key (Low, reproduced).** `docs/testing.md` says the harness key is deleted on normal shutdown, but after a passing `pnpm test:e2e` the key file remained. It is local, synthetic and ignored by Git. Delete it at startup, or give Playwright a graceful-shutdown signal.
- **Harness title (Info).** Pages in the harness are titled "Slice synthetic browser tests", which belongs to the harness. Production page titles were not checked.

### Data correctness and recovery

### D1. Stored membership records are trusted without checking: one bad row can lock everyone out, and a mistyped flag can grant ownership

- **Severity:** Medium. **Status:** reproduced with synthetic local data.
- **Who and where:** every member and app; production D1 whenever an operator edits rows by hand (bootstrap, recovery, the identity rebinding in S10).
- **Business impact:** the normal app never writes bad rows. The documented operating procedures, however, rely on hand-written SQL. A single mistake can either take membership offline for the whole organization or quietly make someone an owner.
- **Evidence:** `Repository.load()` parses each JSON document and casts it without checking (`platform/src/membership/repository.ts:21-22`). Ownership is a truthiness check (`domain.ts:19`, `:163`, `:189`). Tests in `platform/tests/evaluation/malformed.test.ts`:
  - storing `owner` as the text `"false"` (an easy `json_set(..., 'false')` slip) gives that member every permission and lets them suspend the real owner (HTTP 200);
  - one `null` member row makes the owner, other members and new sign-ins all receive HTTP 500;
  - a member row missing `allow` makes that member's requests and the owner's repair attempt return 500.
- **Expected vs observed:** expected that an invalid row grants nothing, does not affect anyone else, and can be repaired by an owner. Observed that it grants ownership or crashes requests.
- **Fix:** validate rows in `load()` with strict schemas (`owner: z.boolean()`, a status enum, arrays). Treat an invalid row as having no access, leave it out of the "last active owner" count, and log it. Provide reviewed SQL templates for operator edits.
- **Verify:** the four `known defect` cases in `malformed.test.ts` start failing as `it.fails`. Convert them to `it` and they pass.

### D2. There is no tested database recovery procedure

- **Severity:** Medium. **Status:** documentation reviewed; local export and restore rehearsed; Cloudflare Time Travel not exercised.
- **Business impact:** a Worker rollback restores code, not data. The docs say this clearly and correctly. If membership data is damaged, though, the operator has to improvise a destructive restore during an incident.
- **Evidence:** `docs/migrations.md` refers to "the documented D1 recovery mechanism", but there is no runbook. Nothing covers the Time Travel or export commands, the credential that may run them, recovery point or time targets, freezing writes, verification queries, or handling of exports, which contain member personal data. The local rehearsal (`platform/tests/evaluation/d1-rehearsal.sh`, `--local` only, placeholder database ID) exported and restored synthetic data with an identical snapshot. Restoring onto a non-empty database failed safely, with no partial data. `recovery.test.ts` also shows that after a point-in-time restore, revision numbers repeat. A browser tab opened on discarded data can then overwrite a newer change (HTTP 200 instead of 409). Raising the revision after restoring prevents this.
- **Fix:** write a short runbook:
  1. Freeze writes.
  2. Record the current Time Travel bookmark as the undo point.
  3. Restore to a timestamp or bookmark.
  4. Raise `organization.revision` by a large step.
  5. Run the rehearsal's verification queries.
  6. Name the operator and the credential, and state where exports may be kept and when they are deleted.
  7. Rehearse once on a non-production D1 database.
- **Verify:** a supervised drill on a disposable remote database is recorded with its timings.

### D3. Smaller data findings

- **One shared revision number.** See C7: unrelated saves conflict, and the typed edit is lost on reload. Data stays safe.
- **Only the latest 50 activity entries are reachable (Low, reproduced).** `repository.ts:75` has no pagination, so older entries can be read only with database access. Entries are ordered by the Worker clock, not by commit order. Store the revision in each audit row, order by it, and add cursor pagination.
- **A lost response after a successful save shows "could not be loaded" (Info, reproduced).** The retry then reports a conflict, and after reloading the change is present exactly once. Use a "this may have been saved; reload" message for write failures.
- **What passed:** concurrent edits (always exactly one winner and one 409), a replayed old request, duplicate sign-ins and invitations (including email letter-case variants), failures injected mid-save (no partial state), audit consistency, and repeated migrations.

### Contributor experience and documentation

### G1. Contributors cannot see their own app, or any signed-in page, before it is in production

- **Severity:** High for app builders. **Status:** reproduced in a clean clone.
- **Business impact:** merging releases straight to production, and the contribution guide asks for desktop and mobile screenshots. A consultant has no supported way to see `/apps/<id>` signed in before it is live.
- **Evidence:** `pnpm dev` serves the launcher, which shows the new app tile. `/apps/demo` redirects to `/account`. **Sign in** goes to `/api/membership/login`, which returns raw JSON `{"error":"Sign in to continue."}`. Local development uses the production Access issuer and audience from `platform/wrangler.jsonc`. The synthetic browser harness (`platform/tests/e2e/server.ts`) serves only the account and launcher screens and the membership API, has no `/apps/*` routes, and is not documented for manual use. The scaffolded README nevertheless says "run `pnpm dev`; this app is at `/apps/<id>`" (`scripts/platform-apps.mjs:237`).
- **Fix:** add a documented local preview that signs in a synthetic owner with the existing per-run harness key. Serve `/apps/<id>` through the real dispatch, and keep it out of the production entry with the existing `slice-e2e-only` artifact guard. Until then, state the limitation plainly. Make local **Sign in** explain why it is unavailable.
- **Verify:** following the README, a newcomer opens `/apps/demo` locally as a synthetic owner, and the release artifact check still rejects the harness.

### G2. The contribution guide leaves out things a new contributor needs

- **Severity:** Low. **Status:** reviewed against settings.
- **Gaps:**
  - It doesn't say whether to fork or push a branch (pushing needs Write access).
  - Fork PRs from first-time contributors wait for approval before CI runs.
  - Only `validate` is required.
  - Private vulnerability reporting is offered but switched off, and no private contact is given.
  - No external contributor PR has been made yet, so the fork path is untested.
- **Fix:** add a short "fork or branch" paragraph, name the required check, and enable private reporting or name a contact.

### G3. Several current guides are out of date

- **Severity:** Low. **Status:** reproduced.
- **Stale statements:**
  - `docs/testing.md` says "37 application tests"; there are now 67 application, 95 tooling and 3 browser tests.
  - `docs/security-review.md` says secret scanning and push protection are on (S8) and that Ivan is the sole maintainer, but a Write collaborator exists.
  - `docs/deployment.md` doesn't mention that the latest releases failed verification (S2).
  - `docs/ai-review.md` keeps the "Accepted operating policy — GPT-6 Sol via Cloudflare" and the GPT-oriented limits table at the same heading level as the current Claude subscription setup.
  - Historical plans under `docs/superpowers/` carry stale banners and live instructions, such as "Use superpowers:executing-plans".
- **Missing explanations:** the status words in the review comment (completed, incomplete, failed, unavailable) aren't listed, and there is no sample comment. The PR template's relative link breaks inside a PR body.
- **What works well:** all 46 Markdown files had zero broken relative links or anchors, and the 38 external links resolved. Where an app goes is very clear. "Awaiting platform setup" is explained. The documentation index separates current guides from historical evidence. Checks are fast, at about 30 seconds in total.
- **Fix:** move the dated ai-review sections under "Historical", add a status table and a sample comment, and refresh the counts and statements above.

### G4. Prerequisite setup is thin

- **Severity:** Low. **Status:** reviewed.
- **Gaps:**
  - Versions are listed, but there are no install links, no `corepack enable` step, no `.nvmrc`, and no `git clone` or GitHub access step.
  - CONTRIBUTING omits `--with-deps` for the browser install, which CI and `docs/testing.md` both use.
  - Node 24 is listed as supported but never runs in CI.
  - `pnpm install` warns "Ignored build scripts: esbuild, workerd", with no explanation.

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

<a id="test-matrix"></a>

## Test matrix

**Passed:** behaved as expected. **Failed:** a defect or gap, with the finding referenced. **Unverified:** could not be tested, and why. **Not applicable:** does not apply to the current release.

| Area                                     | Scenario                                                                                                      | Result             | Evidence                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| A. Identity, permissions, privacy        | Unsigned, forged, wrong-audience, expired and service identities rejected (membership, app page/API, MCP)     | **Passed**         | permission matrix and CI tests: 401 everywhere                                     |
| A. Identity, permissions, privacy        | Owner has full authority, labelled Admin (owner)                                                              | **Passed**         | permission matrix                                                                  |
| A. Identity, permissions, privacy        | Delegated admin cannot exceed or edit its own authority (10 cases)                                            | **Passed**         | permission matrix: 9 refusals (403), 1 permitted approval                          |
| A. Identity, permissions, privacy        | Activity reviewer sees history only; Admin label only for manage permissions                                  | **Passed**         | permission matrix                                                                  |
| A. Identity, permissions, privacy        | Ordinary member directory hides emails and non-active members                                                 | **Passed**         | permission matrix: fields id, name, title, levelName only                          |
| A. Identity, permissions, privacy        | Pending, invited, suspended and unknown people cannot use admin, apps or MCP                                  | **Passed**         | permission matrix, 77 recorded cells, 0 mismatches                                 |
| A. Identity, permissions, privacy        | Suspension and individual Revoke apply to the next request with the same sign-in                              | **Passed**         | permission matrix (API, page, MCP)                                                 |
| A. Identity, permissions, privacy        | Last active owner cannot be removed or suspended                                                              | **Passed**         | permission matrix                                                                  |
| A. Identity, permissions, privacy        | Changed email or a second account cannot take over a membership; email case ignored                           | **Passed**         | permission matrix                                                                  |
| A. Identity, permissions, privacy        | Cross-user edits by ordinary members refused                                                                  | **Passed**         | permission matrix: 400 or 403                                                      |
| A. Identity, permissions, privacy        | Access team change preserves members                                                                          | **Failed**         | S10: everyone, including the owner, locked out                                     |
| A. Identity, permissions, privacy        | Permission tests detect injected authorization bugs                                                           | **Passed**         | 4 mutants each caught by both CI suite and matrix                                  |
| A. Identity, permissions, privacy        | Real Google sign-in and Access policy in production                                                           | **Unverified**     | no member account; site is Access-protected                                        |
| A. Identity, permissions, privacy        | Isolation between organizations                                                                               | **Not applicable** | one organization by design                                                         |
| B. Contribution and release              | Required check `validate` on main, strict, pinned to GitHub Actions                                           | **Passed**         | branch protection API                                                              |
| B. Contribution and release              | Maintainer review required for Write collaborators                                                            | **Failed**         | S1: 0 approvals, no CODEOWNERS, Write collaborator present                         |
| B. Contribution and release              | PR code cannot read production or model credentials                                                           | **Passed**         | workflows and environment branch policies inspected; not exploit-tested            |
| B. Contribution and release              | Production credentials limited to protected main                                                              | **Passed**         | environment API: protected branches only                                           |
| B. Contribution and release              | Rollback limited to maintainers                                                                               | **Failed**         | S7: any Write account can dispatch                                                 |
| B. Contribution and release              | Exact validated artifact promoted; verified record only on success                                            | **Passed**         | release tests; verified-release artifact present only on passing run               |
| B. Contribution and release              | Post-release verification reliable                                                                            | **Failed**         | S2: 7 of last 10 failed on asset 404 after upload                                  |
| B. Contribution and release              | Failed release leaves production on a verified version                                                        | **Failed**         | S2: no rollback; version 818e63d6 left serving (inferred)                          |
| B. Contribution and release              | Rollback mechanics (isolated fixtures)                                                                        | **Passed**         | scripts/release.test.mjs, 8 tests                                                  |
| B. Contribution and release              | Live rollback                                                                                                 | **Unverified**     | never run successfully; two October 4 attempts failed; not exercised               |
| B. Contribution and release              | Secret scanning, push protection, private vulnerability reporting                                             | **Failed**         | S8: all disabled                                                                   |
| B. Contribution and release              | Organization two-factor requirement                                                                           | **Failed**         | S9                                                                                 |
| B. Contribution and release              | Security scanning gate (CodeQL, dependency review) runs and blocks                                            | **Passed**         | green on main; 2 medium code-scanning and 2 high Dependabot alerts open (S12)      |
| B. Contribution and release              | External Actions pinned to commit SHAs                                                                        | **Passed**         | by convention; repository setting does not require it                              |
| C. Consultant and administrator journeys | Onboarding, pending limits, owner approval, profile persistence                                               | **Passed**         | C1 journey                                                                         |
| C. Consultant and administrator journeys | Pending person: own profile only; history, add and level calls refused; empty directory                       | **Passed**         | C1 journey                                                                         |
| C. Consultant and administrator journeys | Invite, then invitee sign-in becomes active; custom level; Allow and Revoke take effect                       | **Passed**         | C2 journey                                                                         |
| C. Consultant and administrator journeys | Delegated administrator meets locked and forbidden actions                                                    | **Passed**         | C5 journey                                                                         |
| C. Consultant and administrator journeys | Suspension while the member's page is open                                                                    | **Passed**         | C6 journey (server denies at once)                                                 |
| C. Consultant and administrator journeys | Invalid, overlong and duplicate input rejected                                                                | **Passed**         | C3 journey                                                                         |
| C. Consultant and administrator journeys | Plain-language validation errors tied to fields                                                               | **Failed**         | C6: raw library wording, no aria-describedby                                       |
| C. Consultant and administrator journeys | Server, network and expired-session errors                                                                    | **Failed**         | C1                                                                                 |
| C. Consultant and administrator journeys | Activity view after a load error                                                                              | **Failed**         | C2: false empty log                                                                |
| C. Consultant and administrator journeys | Stale revision message and recovery                                                                           | **Failed**         | C7: unrelated edits fail; typed edit lost                                          |
| C. Consultant and administrator journeys | Allow/Revoke accessible names                                                                                 | **Failed**         | C3                                                                                 |
| C. Consultant and administrator journeys | Keyboard: skip link, every control operable, no trap                                                          | **Passed**         | C8 journey                                                                         |
| C. Consultant and administrator journeys | Keyboard focus after save, error and tab load                                                                 | **Failed**         | C4                                                                                 |
| C. Consultant and administrator journeys | Errors visible on phones                                                                                      | **Failed**         | C4: alert 364 px above viewport                                                    |
| C. Consultant and administrator journeys | No sideways scroll at 1280, 375 and 640 px with typical data                                                  | **Passed**         | C9 journey                                                                         |
| C. Consultant and administrator journeys | Long unbroken names; 320 px reflow                                                                            | **Failed**         | C5                                                                                 |
| C. Consultant and administrator journeys | axe WCAG 2.0–2.2 A/AA on about 60 states                                                                      | **Passed**         | except expanded Activity at <= 640 px (C5)                                         |
| C. Consultant and administrator journeys | Reduced motion                                                                                                | **Passed**         | no animations or transitions                                                       |
| C. Consultant and administrator journeys | Input boundary contrast 3:1                                                                                   | **Failed**         | C6: known gap already documented                                                   |
| C. Consultant and administrator journeys | Sign out                                                                                                      | **Unverified**     | harness has no sign-out route                                                      |
| C. Consultant and administrator journeys | Screen reader announcements; Safari, Firefox and real devices                                                 | **Unverified**     | not available in this evaluation                                                   |
| D. Shared app inheritance                | Scaffold creates module and registers catalog                                                                 | **Passed**         | `pnpm app:create evalprobe`                                                        |
| D. Shared app inheritance                | Full documented gate with an app present                                                                      | **Failed**         | S3: page.test.ts fails                                                             |
| D. Shared app inheritance                | App inherits login and current membership (deny paths)                                                        | **Passed**         | 37 probe tests through real dispatch, MCP adapter and D1                           |
| D. Shared app inheritance                | Allowed action (GET with app.open) and denied action (POST without records.edit)                              | **Passed**         | 200 / 403 with no write                                                            |
| D. Shared app inheritance                | Immediate revocation of an app action                                                                         | **Passed**         | next POST 403                                                                      |
| D. Shared app inheritance                | App MCP tools filtered and re-checked on call                                                                 | **Passed**         | probe MCP tests                                                                    |
| D. Shared app inheritance                | Compiled Worker denies app page/API and /mcp without valid sign-in                                            | **Passed**         | 307 to /account; 401; 404 for unknown app                                          |
| D. Shared app inheritance                | One shared build and release; no per-app deploy step or credential                                            | **Passed**         | workflows inspected                                                                |
| D. Shared app inheritance                | Guardrail: app reads membership database directly                                                             | **Failed**         | A1: ships                                                                          |
| D. Shared app inheritance                | Guardrail: route outside guarded folders                                                                      | **Failed**         | A2: ships, returns data without sign-in locally                                    |
| D. Shared app inheritance                | Guardrail: test code alters release config                                                                    | **Failed**         | A3: change reaches dist                                                            |
| D. Shared app inheritance                | Guardrail: undeclared tool permission                                                                         | **Failed**         | A4: ships; /mcp 500 for everyone                                                   |
| D. Shared app inheritance                | Guardrail: server action, MCP SDK import, client import of server code, wrangler.jsonc/package.json in module | **Passed**         | caught by check:platform / check-architecture                                      |
| D. Shared app inheritance                | Guardrail: GET that writes, read-only tool that writes, Set-Cookie                                            | **Failed**         | A5: ship (Low)                                                                     |
| D. Shared app inheritance                | Undeclared action at runtime fails closed                                                                     | **Passed**         | 403, including for owners                                                          |
| D. Shared app inheritance                | Record-level rules in a real business app                                                                     | **Not applicable** | no business apps exist; the probe used in-memory records                           |
| E. Personal AI / MCP                     | Production OAuth discovery (Bearer challenge, protected-resource metadata)                                    | **Failed**         | S11: 302 to login with Cloudflare-Access header; activation pending, as documented |
| E. Personal AI / MCP                     | Browser sign-in, initialize, list and permitted call in an approved real client                               | **Unverified**     | blocked: managed OAuth not activated                                               |
| E. Personal AI / MCP                     | Official MCP client connection attempt (unauthenticated)                                                      | **Failed**         | S11: @modelcontextprotocol/client 2.3.1 refuses login redirect                     |
| E. Personal AI / MCP                     | Synthetic: initialize, list and call with role-based filtering                                                | **Passed**         | CI MCP tests and permission matrix                                                 |
| E. Personal AI / MCP                     | Synthetic: denied calls and revocation between list and call                                                  | **Passed**         | permission matrix and probe tests                                                  |
| E. Personal AI / MCP                     | CI service identity rejected at /mcp in production                                                            | **Passed**         | deploy logs of verified release                                                    |
| E. Personal AI / MCP                     | App tools exposed in production                                                                               | **Not applicable** | catalog empty; only slice_apps exists                                              |
| E. Personal AI / MCP                     | CI reviewer credential separate from personal identity                                                        | **Passed**         | separate Access application and token; application rejects service identities      |
| F. Data correctness and recovery         | Concurrent edits: one winner, loser 409, audit matches                                                        | **Passed**         | concurrency.test.ts, forced and free-running                                       |
| F. Data correctness and recovery         | Stale replay rejected                                                                                         | **Passed**         | concurrency.test.ts                                                                |
| F. Data correctness and recovery         | Duplicate sign-ins and invitations                                                                            | **Passed**         | duplicates.test.ts                                                                 |
| F. Data correctness and recovery         | Failed writes leave no partial state                                                                          | **Passed**         | failures.test.ts, 5 injection points                                               |
| F. Data correctness and recovery         | Audit consistency (one row per change, before/after match)                                                    | **Passed**         | audit.test.ts                                                                      |
| F. Data correctness and recovery         | Older audit history reachable                                                                                 | **Failed**         | D3: latest 50 only                                                                 |
| F. Data correctness and recovery         | Malformed stored rows fail safe                                                                               | **Failed**         | D1: crash or ownership                                                             |
| F. Data correctness and recovery         | Migrations idempotent; ledger compatible with Wrangler                                                        | **Passed**         | migrations.test.ts; test:migrations                                                |
| F. Data correctness and recovery         | Upgrade migration that changes the schema                                                                     | **Not applicable** | only migration 0001 exists                                                         |
| F. Data correctness and recovery         | Local export and restore of synthetic data                                                                    | **Passed**         | d1-rehearsal.sh: identical snapshot                                                |
| F. Data correctness and recovery         | Stale tab rejected after point-in-time restore                                                                | **Failed**         | D2: revision reuse                                                                 |
| F. Data correctness and recovery         | Documented recovery runbook                                                                                   | **Failed**         | D2                                                                                 |
| F. Data correctness and recovery         | Cloudflare Time Travel restore                                                                                | **Unverified**     | remote-only; not authorized                                                        |
| G. Contributor experience                | Frozen install from a clean clone                                                                             | **Passed**         | pnpm install --frozen-lockfile                                                     |
| G. Contributor experience                | Local dev starts; health works                                                                                | **Passed**         | pnpm dev                                                                           |
| G. Contributor experience                | Local sign-in or signed-in preview                                                                            | **Failed**         | G1                                                                                 |
| G. Contributor experience                | Scaffold, then documented checks                                                                              | **Failed**         | S3                                                                                 |
| G. Contributor experience                | Contribution guide covers fork/branch, reviewers, required checks                                             | **Failed**         | G2                                                                                 |
| G. Contributor experience                | Relative links and anchors (46 Markdown files)                                                                | **Passed**         | 0 broken                                                                           |
| G. Contributor experience                | External links (38)                                                                                           | **Passed**         | transient rate limits only                                                         |
| G. Contributor experience                | Current guides match implementation and settings                                                              | **Failed**         | G3                                                                                 |
| H. Reliability, performance, AI review   | Documented gate on main (format, lint, typecheck, tests, coverage, migrations, browser, build, smoke)         | **Passed**         | all green; about 28 s on the Mac mini                                              |
| H. Reliability, performance, AI review   | Local load: 300 requests at 10 concurrent per route                                                           | **Passed**         | p50 8–17 ms; expected statuses (one /mcp exception below)                          |
| H. Reliability, performance, AI review   | Local /mcp under parallel load                                                                                | **Failed**         | S12: 5 of 1,500 failed in local proxy; cause not established                       |
| H. Reliability, performance, AI review   | Membership database unavailable                                                                               | **Passed**         | existing tests: generic 500, no data                                               |
| H. Reliability, performance, AI review   | Sign-in key service unavailable                                                                               | **Failed**         | S12: tells user to sign in again                                                   |
| H. Reliability, performance, AI review   | Missing Access configuration                                                                                  | **Passed**         | 503, fails closed                                                                  |
| H. Reliability, performance, AI review   | Scaling to 1,000 members                                                                                      | **Passed**         | 264 KB admin view, 7.9 ms local p50; not a near-term risk                          |
| H. Reliability, performance, AI review   | Advisory review shows honest status (green job is not a completed review)                                     | **Passed**         | PR #30: green workflow, comment says incomplete                                    |
| H. Reliability, performance, AI review   | Advisory review completes on ordinary PRs                                                                     | **Failed**         | S5: 2 of 8 on subscription route                                                   |
| H. Reliability, performance, AI review   | Reviewer keeps valid findings when one is invalid                                                             | **Failed**         | S5 probe                                                                           |
| H. Reliability, performance, AI review   | Reviewer distinguishes busy from unavailable                                                                  | **Failed**         | S5 probe                                                                           |
| H. Reliability, performance, AI review   | New commits make earlier review stale                                                                         | **Passed**         | comments record base/head; pending on push                                         |
| H. Reliability, performance, AI review   | Interrupted review finalizes its status                                                                       | **Failed**         | S12: PR #23 stuck pending                                                          |
| H. Reliability, performance, AI review   | Reviewer usage limited to trusted authors                                                                     | **Failed**         | S6                                                                                 |
| H. Reliability, performance, AI review   | Reviewer keeps running after November 2, 2026                                                                 | **Failed**         | S4 (reasoned)                                                                      |
| H. Reliability, performance, AI review   | Reviewer detection on new known-defect and clean cases (live)                                                 | **Unverified**     | credential access blocked; six cases prepared                                      |

Totals: 59 passed, 40 failed, 7 unverified, 4 not applicable.

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

- **In this PR:** `platform/tests/evaluation/` (Vitest suite and local D1 rehearsal; see its README). The suite ran 61 passing tests and 5 expected failures that document known defects. `pnpm lint`, `pnpm typecheck` and `pnpm format:check` pass with these files present. They do not join CI.
- **Outside Git (evaluator's machine):**
  - the disposable `evalprobe` app and its bypass variants;
  - browser screenshots with synthetic data;
  - raw logs;
  - the six held-out reviewer cases built from real repository files;
  - the deterministic reviewer probes;
  - load-test scripts.

  These contain no credentials or private data. They were kept out of the repository because they are working evidence, or because the instructions asked that the evaluation app never be merged.

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
