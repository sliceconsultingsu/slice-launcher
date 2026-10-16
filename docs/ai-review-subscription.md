# Subscription review setup

Slice's review job calls the owner's Subscription API to review public repository changes. Builds and tests still run on GitHub. The Mac mini handles only the text request through its signed-in Claude subscription.

## Connection and access

```text
Protected-base GitHub review job
  → HTTPS + dedicated Cloudflare service identity + separate review key
  → app-subscription-api.chenagent.com/ci/slice/review
  → loopback Subscription API → Claude Opus 5.5, High reasoning, no tools
```

The request URL and `claude/claude-opus-5-5` route are fixed in trusted code. PR text cannot change them. The gateway uses its own credential for this endpoint; the credential cannot access the dashboard, personal API, saved defaults or other model routes. Keep the gateway master key and provider sign-ins on the Mac mini.

Use a dedicated **Service Auth** Access application for the exact hostname/path above, accepting only the Slice review service token. Preserve the existing owner-only dashboard application. In the local Cloudflare Tunnel configuration, put an exact-host, anchored `^/ci/slice/review$` path rule before the wildcard launcher rule. Its origin is `http://127.0.0.1:8932`; enable `originRequest.access.required: true`, team `snowy-voice-36a1`, and only the new application's audience. This makes cloudflared verify the signed Access identity before forwarding. Do not route the rest of the hostname directly to the gateway or disable the dashboard's owner check.

The connection was activated and verified on October 15, 2026. It uses a dedicated one-year service token, expiring October 15, 2027, and secrets in GitHub’s protected `ai-review` environment. A real hosted review of PR #30 completed through this connection. The steps below document setup and recovery; merging a workflow alone does not provision its connection.

## Credentials and activation

1. Review and release the Subscription API change adding the disabled-by-default endpoint. Set `CI_REVIEW_KEY_FILE` to an owner-only file containing a separately generated review credential; restart the gateway through its existing service manager. Do not replace `gateway.key`.
2. Create the scoped Cloudflare service identity and Service Auth application/policy. Record the audience and expiry privately. Install the exact tunnel route above, validate the configuration, then restart the existing connector while preserving other routes.
3. In the Slice repository's protected `ai-review` environment, set `SUBSCRIPTION_REVIEW_KEY`, `SUBSCRIPTION_ACCESS_CLIENT_ID` and `SUBSCRIPTION_ACCESS_CLIENT_SECRET`. Keep the environment restricted to protected main. No personal subscription credential or gateway master key belongs in GitHub.
4. Confirm unsigned public requests fail, either credential alone fails, and a request with both credentials can reach only this endpoint. Verify the owner dashboard remains protected. Make a harmless review request before enabling the workflow.
5. Merge the Slice workflow change after required checks and maintainer review. Because jobs execute protected-base code, the new transport is exercised by hosted review only after merge. Dispatch a small open PR from main and verify its current-commit comment. Ordinary PR build jobs must never receive these credentials.

Store secrets without printing them or adding them to command arguments. Rotate before the Access credential expires. To revoke access, remove the service identity from the policy and delete the GitHub review secrets; remove the dedicated path route and unset `CI_REVIEW_KEY_FILE` when decommissioning. Preserve unrelated policies/routes.

## What checks still apply?

The reviewer reads exact base/head source, treats it as untrusted text, and makes at most one request with no retries or paid-provider fallback. JSON output must pass the existing schema, changed-line and exact-evidence checks. The separate publisher independently rechecks evidence and current commit before commenting. Invalid output, timeouts, quota/busy errors and missing credentials remain visibly failed, unavailable or incomplete, never a clean review.

Subscription requests also fit the gateway's 200,000-character review conversation and 256,000-byte body limits. Oversized input is rejected before calling; source is not silently cut. The response reader remains capped at 80,000 bytes and the client timeout at 90 seconds. The gateway permits one request per provider at a time, so overlapping PR reviews may report busy. Rerun deliberately after checking the earlier request, rather than automatically retrying and consuming more allowance.

## Limits to understand

This gateway returns text, not guaranteed structured output. It does not support output-token limits, report token usage/cost or independently attest the upstream model version; its model field echoes the requested route. Slice verifies the route and output evidence but does not claim upstream version attestation. The gateway requests High effort and disables Claude’s automatic switching to another model on flagged requests. It requires Claude Code 2.1.280 or newer (verified with 2.1.301); the response does not independently attest that setting either.

The old $1 reservation and 4,096-output-token cap apply only to the retained paid-provider transports, not this subscription route. In its legacy report fields, token counts and reserved cost are zero placeholders for **unreported/not applicable**, and `estimatedUsd` remains null. They do not mean free usage or a measured spending cap. Subscription quota, provider credit settings and CLI retention rules still apply. Keep any optional additional spending disabled unless deliberately approved in the provider account. The gateway does not enable paid API-key fallback.

Availability depends on the Mac mini, tunnel, gateway and subscription sign-in. AI advice is not a required release gate; ordinary tests and security scans remain independent.

## Verified model connection

A synthetic live review through the candidate gateway and Slice adapter requested Claude Opus 5.5 at High effort, found the introduced authorization bug, and passed the existing exact-source evidence checks. The subsequent [hosted review of PR #30](https://github.com/sliceconsultingsu/slice-launcher/actions/runs/38836195196) completed through Cloudflare and the production gateway in about 28 seconds, returning a finding that passed exact-source evidence validation. That run reviewed base `02fbb89` and head `5f1512d`; later commits need a fresh review. The changed screenshot was disclosed as requiring human visual review.

Public connection checks confirmed that unsigned requests and the review key alone were rejected by Cloudflare, the Access credential alone was rejected by the gateway, and both credentials reached request validation. Requests carrying both CI credentials to `/v1/models` and `/` still redirected to owner sign-in; those credentials did not grant access to the personal API or dashboard. These checks establish the dedicated connection; they do not activate consultants’ separate personal MCP sign-in.
