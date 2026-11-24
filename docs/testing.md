# Testing membership and migrations

Run `pnpm test` for repository checks and all application unit/integration tests; `pnpm test:coverage` adds V8 measurement and critical-module gates. `pnpm test:migrations` runs the two migration scenarios independently. For browsers, install Chromium using `pnpm --filter @slice/launcher exec playwright install --with-deps chromium`, then run `pnpm test:e2e`.

## Disposable synthetic browser boundary

`platform/tests/e2e/server.ts` binds only `127.0.0.1:4173`, starts an in-memory Miniflare D1 database, applies the real migration files and configures a synthetic owner. No Wrangler production database binding or Cloudflare credentials are used. Production launcher/account components run in a separate Vite entry, and the harness invokes the real identity verifier, request handler, domain rules and repository. Every synthetic identity carries an RS256 signature checked by `verifyIdentity` against a per-run ephemeral key. There is no unsigned email/header bypass. The signing key lives in ignored `.e2e/`, is denied by the Vite file server, and is deleted on normal shutdown. A crash may leave an ignored key until the next run overwrites it; it is valid only for that local harness.

The harness is outside the application entry graph. Artifact validation rejects its `slice-e2e-only` marker. Never import this harness from a production entry or add test identity flags to production. These are synthetic application browser tests; they do not verify real Google sign-in, Cloudflare Access policy, deployed Worker routing or remote JWKS availability. The built Worker smoke check below covers the session cookie and compiled routes. The account shell is public-safe; protected directory/history views and every write remain governed by current server membership permissions.

The browser scenario covers onboarding, pending restrictions, direct forbidden writes/history, owner approval, profile editing and reload persistence, private directory fields, custom access levels, immediate revocation, suspension, disabled profile editing, and launcher/account navigation. Axe checks WCAG A/AA rules on onboarding, profile, member-access form, sign-in and launcher/navigation. A separate negative scenario rejects missing, tampered and service assertions. The app settings scenario covers an owner opening an app to everyone and then to named people, handing it to a manager, a member losing the app at once when taken off it, a direct forbidden save, a stale save, and what a signed-out, new or pending person sees; Axe checks the app page as owner, manager and member at desktop and 390px widths. Role regression checks distinguish owner/admin authority from the base Member level and deny ordinary-member access to administration and activity, including direct API calls. Axe automation does not replace keyboard/screen-reader review.

There are no retries. Browser workers run serially against a new database each invocation, with distinct synthetic identities per scenario. Failures retain traces and screenshots under `platform/test-results/` and an HTML report under `platform/playwright-report/`. These can contain synthetic emails and short-lived synthetic JWTs; never run this harness with real identities, upload `.e2e/`, or add production secrets to the browser job. CI retains diagnostics for seven days. Review artifacts before sharing outside the repository.

## Signed-in check on the built Worker

`pnpm smoke:launcher` starts the compiled Worker with Wrangler and a disposable local D1 database in a temporary folder. It applies every migration, then adds synthetic people and sessions from `scripts/signed-in-smoke.mjs`. Only a hash of each session token is stored, as real sign-in does. The check then sends real `__Host-slice_session` cookies through the compiled routes:

- An active member reaches their membership, the alumni API and the alumni page.
- A pending member is signed in but gets an empty permission list, a 403 from the app API and a redirect to their account from the app page.
- Expired, unknown and missing sessions get 401.
- A new person joins as pending. A write without the app's own origin is refused.
- A burst of changes from one person is refused with 429, and other people are unaffected. This is the only check of the per-person limit as the compiled Worker wires it.
- Signing out ends the session on the server. Another site cannot sign a member out.

This is the only automated check that runs the production sign-in path (session cookie, compiled routes, D1) end to end. It does not cover the Google sign-in exchange itself, which needs Google; `google.test.ts` covers that logic with synthetic tokens. It runs locally and in pull request validation, never against production, so it does not show that the deployed Worker's database or secrets are healthy.

## Fixture lifetime and measured coverage

D1 startup previously consumed the default five-second test timeout on a cold Miniflare start. Startup/migration now runs in `beforeAll` with a 30-second hook budget, reset runs before each test, and the runtime is disposed after the suite. Assertions retain Vitest's normal deadline; no retry hides a failed assertion. The database tests include persistence, duplicate enrollment, stale revisions and rollback when the final audit insert fails after earlier writes.

On the Mac mini with Node 22.23.3, the 37 application tests passed in 1.19 seconds and both Chromium scenarios passed in 5.6 seconds including server startup. These are local warm measurements, not a promised CI duration. Critical-module coverage measured before gates:

| Module     | Statements | Branches | Functions |  Lines | Gate floors (same order) |
| ---------- | ---------: | -------: | --------: | -----: | ------------------------ |
| auth       |     88.09% |   90.00% |      100% | 87.17% | 88 / 90 / 100 / 87       |
| api        |     94.87% |   86.20% |      100% | 93.75% | 94 / 86 / 100 / 93       |
| domain     |     99.23% |   94.61% |      100% | 99.05% | 99 / 94 / 100 / 99       |
| repository |     96.55% |   91.66% |      100% |   100% | 96 / 91 / 100 / 100      |

Floors added on November 16, 2026, measured the same way:

| Module                     | Statements | Branches | Functions |  Lines | Gate floors (same order) |
| -------------------------- | ---------: | -------: | --------: | -----: | ------------------------ |
| membership/session         |       100% |   94.73% |      100% |   100% | 100 / 94 / 100 / 100     |
| membership/google          |     92.50% |   86.15% |      100% | 96.92% | 92 / 86 / 100 / 96       |
| platform/access            |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| platform/dispatch          |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| platform/mcp-tool          |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| platform/mcp               |     92.30% |   88.88% |    81.81% | 93.44% | 92 / 88 / 81 / 93        |
| ai-connections/consent     |     94.25% |   83.63% |      100% | 97.43% | 94 / 83 / 100 / 97       |
| ai-connections/connections |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| ai-connections/status      |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| ai-connections/activity    |     95.23% |   90.90% |    87.50% |   100% | 95 / 90 / 87 / 100       |

Floors added on November 19, 2026 for [member apps](member-apps.md) and the launcher's address, measured the same way:

| Module                   | Statements | Branches | Functions |  Lines | Gate floors (same order) |
| ------------------------ | ---------: | -------: | --------: | -----: | ------------------------ |
| platform/address         |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| member-apps/rules        |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| member-apps/registry     |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| member-apps/service      |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| member-apps/app-sessions |       100% |     100% |      100% |   100% | 100 / 100 / 100 / 100    |
| member-apps/publish      |       100% |   97.61% |      100% |   100% | 100 / 97 / 100 / 100     |
| member-apps/pass-route   |     95.12% |   95.00% |      100% |   100% | 95 / 95 / 100 / 100      |
| member-apps/front-door   |     95.95% |   89.13% |      100% | 98.75% | 95 / 89 / 100 / 98       |
| member-apps/info         |       100% |   90.90% |      100% |   100% | 100 / 90 / 100 / 100     |

The member apps tests are written the way someone attacking the launcher through an app would work: a session from another app, a pass replayed or sent to another person's browser, a path that climbs out of the app, a page on one app requesting another, a member suspended between two requests, and two publishes at the same moment. The front door and the pass page were also checked by breaking each access rule in turn and confirming a test failed.

`auth.ts` is the retired Cloudflare Access verifier. Production no longer calls `verifyIdentity`; it remains because the browser and team test servers sign their synthetic identities with it, and its `readCommand` still guards every write. `ai-connections/oauth.ts` has no floor because its tests run it inside Miniflare, which this measurement cannot see; `oauth-worker.test.ts` and `mcp-worker.test.ts` exercise it.

These floors preserve measured coverage for the specific authorization/persistence modules, rounded down to whole percentages. There is no arbitrary repository-wide percentage. The tests exercise rejection behavior and unchanged state, not implementation strings. Auth's uncovered path is remote JWKS retrieval/cache; the synthetic key resolver deliberately cannot validate live Cloudflare availability. Empty app catalog mapping is measured in contracts but not gated. Coverage does not prove all attacks or state combinations are handled. New sensitive behavior needs scenario review even when these floors pass; do not lower gates just to accommodate an uncovered branch.

## Migration checks

The empty database test applies every lexically ordered migration using Wrangler's SQL splitter and D1 transactional batches, with a migration ledger. The prior-schema test starts from frozen `tests/fixtures/prior-membership.sql` (main `178f527`, migration 0001), inserts a representative verified member and audit through the repository, then applies outstanding migrations and checks the existing records survive. A repeat run must leave the ledger unchanged. Keep the fixture frozen when adding future migrations. Migrations 0002 (sessions) and 0003 (whether Google manages a session's email) add a table and a defaulted column, so the upgrade path proves that existing members and audit records survive them. Add migration-specific data assertions for schema changes that rewrite existing data. No production migration was run.

## Role display evidence

The [desktop/mobile screenshots](images/access-roles/README.md) use synthetic accounts and document the distinction between Admin (owner) and an ordinary Member. The browser scenario also asserts that ordinary members receive 403 from administrative writes and activity reads.
