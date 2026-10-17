# Security checks and review

## Automated gates

Secret scanning, push protection and private vulnerability reporting are on (re-enabled 2026-10-16 after the org transfer). Dependabot alerts and security updates have now been enabled; version-update configuration is in `.github/dependabot.yml`. CodeQL advanced analysis scans JavaScript/TypeScript and Actions without building contributor code in its write-permission job. High/critical security findings (score >=7) and error-level findings fail the SARIF gate; failed/missing scanner output fails. PR dependency review rejects newly introduced high/critical vulnerabilities. Lower-severity findings remain visible for triage. All external Actions are pinned to verified upstream commit SHAs and updated by Dependabot.

The stable required `validate` check aggregates quality and security. A cancelled, failed, skipped, or missing required prerequisite is not success. GitHub-hosted runners have no dependency on the Mac mini. PR code execution jobs receive no production/model credentials. CodeQL's write token is limited to security events; it performs no install/build of contributor code. Do not execute PR code from pull_request_target or download executable PR artifacts in privileged review jobs.

## Exceptions

No exceptions are currently configured. Never globally disable scanning or lower severity thresholds to land a change. An exception requires a separate owner-reviewed PR recording the exact advisory/rule, affected dependency/version/path, reason, mitigation, owner, expiry (maximum 14 days), and removal issue. The PR must implement a matching scoped allow entry plus a date-expiry check and tests that an expired/unrelated exception still fails. Until those mechanics are reviewed and merged the gate remains blocked. Suppressions in SARIF do not bypass the severity gate. This deliberate process prevents an undocumented permanent bypass.

## Human review

Authentication changes: trace issuer/audience/signature validation, expiry, service rejection, identity linking, and failure behavior. Authorization changes: trace current membership, pending/suspended restrictions, deny overrides, delegation, last owner, direct APIs and private directory data. Schema changes: test empty and prior-state upgrades, constraints, audit atomicity, and backward compatibility. Workflow changes: inspect every trigger, checked-out ref, credential scope, cache/artifact source, shell interpolation, cancellation, and publishing permission. Review the actual diff even when automated checks pass.

Ivan is the sole maintainer and the only code owner. A `main` ruleset requires a code-owner approval on PRs. Every repository admin can bypass it when merging a PR, so admins merge their own PRs without independent approval; required checks still apply. Revisit this before adding admins. Only admins can run rollback. No AI check can approve, merge, deploy, mutate the database, or waive deterministic checks.

## Existing dependency risk observed 2026-10-04

Dependabot alert #1, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), flags stack-exhaustion denial of service in `braces <=3.0.3`; GitHub currently reports no patched version. The locked path is vinext → vite-plugin-commonjs → vite-plugin-dynamic-import → fast-glob → micromatch → braces 3.0.3. It is build tooling, but the package is transitively classified as a runtime dependency by GitHub. This task does not claim the vulnerability fixed or conclusively unreachable. Time-limited isolated CI limits a build denial of service; it is not a vulnerability patch. Keep the alert open and monitor an upstream fix or replacement. Dependency review gates newly introduced vulnerable dependencies; existing alerts remain visible and require triage.

## Workflow syntax validation

Shared validation runs official actionlint 1.7.12, downloading the fixed Linux release and verifying its SHA-256 before execution. Local verification used the corresponding checksum-verified Mac arm64 release. It caught and corrected use of `runner.temp` in an unsupported job-level environment expression; isolated recovery paths are now initialized within a runner step. The sole ignored diagnostic is actionlint's unrecognized `concurrency.queue` key: GitHub supports [`queue: max`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), which this linter version has not implemented. Remove that narrow compatibility exception when updating actionlint. ShellCheck is disabled in actionlint; CodeQL Actions analysis remains enabled. This does not disable expression/type validation.

## CodeQL result metadata and final review corrections

CodeQL query-pack rules are emitted in SARIF `tool.extensions`, with result-level
component references. The required severity gate resolves that metadata and fails on
missing or ambiguous rules; regression tests cover both extension rules and missing
metadata. The initial driver-only parser incorrectly passed a report containing high
findings. Running the corrected gate against that same downloaded report rejected all
four high findings before the source fixes.

Release/provenance file reads now open with `O_NOFOLLOW | O_NONBLOCK`, validate
the open descriptor, read through that same descriptor, and enforce byte limits
(64 MiB per release file; 2 MiB per provenance JSON). Isolated runner directories
and no concurrent untrusted processes remain part of the release trust boundary.
The HTML smoke probe recognizes case-insensitive asset tags, and architecture
test-directory matching is separate from the filename suffix expression.

The outbound-request alert traced to the GitHub event file's PR number used in a
GitHub API path, not a credential file. That field is now explicitly converted to
a number and validated as a positive safe integer before publishing. No scanner
rule was disabled or finding suppressed to pass these checks.

## PR 11 medium-severity conversation triage — 2026-10-15

Reviewed the remaining CodeQL conversations against the final source, separately from the required high-severity gate. No rule, severity threshold, or alert was suppressed or dismissed.

- `js/prototype-polluting-assignment` in `scripts/check-launcher.test.mjs`: the fixture selected a route from an ordinary object using a request URL and later changed its body for an uppercase-tag test. Replaced the lookup with a `Map`, so prototype properties cannot resolve as routes. Existing smoke tests verify the route fixture still behaves correctly. This is defense-in-depth test-server hardening, not a demonstrated production exploit; the production router is unaffected.
- `js/file-access-to-http` in `scripts/ai-review/github.mjs`: the source is GitHub's event file, not a credential file. PR numbers are converted to positive safe integers, refs are validated 40-character SHAs, and the repository is validated before API calls. The endpoint is fixed to `api.github.com`, redirects are forbidden, and request count/body/time are bounded. Sending those identifiers and validated advisory findings to this repository's GitHub API is intended functionality.
- `js/file-access-to-http` in `scripts/ai-review/core.mjs` from `evaluate-jev.mjs`: the source is the checked-in synthetic fixture corpus explicitly submitted for optional evaluation. Provider endpoints are fixed, account IDs are validated, credentials are injected separately, and the corpus does not contain private records or keys. Sending those public synthetic source examples is intentional. The PR review workflow does not enable Jev or inject its credential.

These two outbound-data conversations are resolved by tracing the intended data flow and its boundaries, not by claiming CodeQL found no data flow. The scanner and ordinary review continue to apply to future changes.
