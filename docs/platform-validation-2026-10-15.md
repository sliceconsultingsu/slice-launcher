# Shared platform validation — October 15, 2026

This change replaces independently deployed app links with modules in one Slice Worker. It is based on the pending CI foundation branch (`feat/cicd-ai-review`); no production deployment, Access policy change, provider-secret activation, or database migration was performed.

## Automated checks

- Formatting, TypeScript and lint passed, including platform registration and client/server boundary checks.
- 73 tooling tests and 49 application tests passed. New cases exercise the actual cryptographic identity verifier and disposable Miniflare D1 storage: shared page/API context, pending/invited/suspended members, forged/missing/service tokens, identity changes, app-scoped grants, deny precedence, current-session revocation, action permissions, same-origin/body limits, unknown apps, HEAD/unsupported methods, database failure, and private response caching.
- Existing critical-module coverage floors and migration checks passed. Platform authorization/dispatch are included in coverage.
- Both Chromium membership scenarios passed, including the existing accessibility checks. This verifies the membership UI with signed synthetic identities, not real Google authentication.
- The normal production build and local Worker smoke passed (page, health endpoint and five assets).

## Scaffold and compiled Worker probe

A temporary module was generated using `pnpm app:create platform-probe "Platform probe"`, type-checked and compiled into the single platform Worker. Its unchanged platform configuration was run locally with Wrangler. The probe was removed and the normal empty-catalog release rebuilt afterward.

| Request                                             | Observed result                            |
| --------------------------------------------------- | ------------------------------------------ |
| `/api/apps/platform-probe` without assertion        | 401                                        |
| `/api/apps/platform-probe/nested` without assertion | 401                                        |
| `/api/apps/platform-probe` with forged assertion    | 401                                        |
| `/apps/platform-probe` without assertion            | 307 to `/account`; no private page content |
| `/apps/platform-probe/nested` without assertion     | 307 to `/account`; no private page content |
| `/api/apps/unknown`                                 | 404                                        |

This verifies scaffold inclusion and the actual compiled routes' denial behavior. Authorized dispatch is tested with signed local identities and real disposable D1; a live Google sign-in to the new routes has not been exercised. No temporary probe module or test identity is included in the final source or build.

## Review and operational limits

Reviewed the new request boundary, cache policy, generated catalog/registry, module entry points, and existing artifact/deployment integration. App response CDN cache overrides are removed; pages are forced dynamic. CI rejects stale registrations, direct routes shadowing the guard, server actions inside modules, separate app deployment configuration, and client imports of server entries.

All modules share a trusted runtime and origin, so this is not an untrusted-code sandbox. Apps still implement domain validation, record-level ownership and explicit action checks. One code release/rollback affects all apps; rollback does not restore data. The catalog remains empty and the alumni product is not implemented by this foundation change.
