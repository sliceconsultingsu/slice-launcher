# Security policy

This repository holds the Slice Consulting launcher: its sign-in, membership and permission checks, the shared AI endpoint (`/mcp`) and the apps that run inside it. The deployed launcher is built from `main`, so `main` is the only supported version.

## Reporting a vulnerability

Report it privately. Do not open a public issue or pull request, and do not post details in a discussion.

1. Go to [Report a vulnerability](https://github.com/sliceconsultingsu/slice-launcher/security/advisories/new) (the repository's **Security** tab, then **Report a vulnerability**). Only the maintainers can see what you send.
2. Say what you found, where (a file, a route or a screen), and how to reproduce it. A short script or the exact requests help most.
3. Say what you think someone could do with it, and anything you are unsure about.

If you cannot use GitHub's form, contact the maintainer privately first and send details only once you have a private channel.

Slice is a student organization with one volunteer maintainer. Expect a reply within several days, not hours. There is no bug bounty.

## Testing safely

- **Test on your own copy.** `pnpm smoke:launcher` starts the compiled Worker on your computer with a throwaway database and synthetic people. The [testing guide](docs/testing.md) explains what it sets up.
- **Do not test against the live launcher** beyond signed-out requests that any visitor's browser would make. Do not try to sign in as someone else, connect an AI app you did not start, flood it, or read, change or delete anyone's data.
- **Never use real member, alumni or client records** in a report, an issue or a pull request. Use made-up examples.
- If you come across real personal data or a credential by accident, stop, do not copy it, and say so in your report.

## What is in scope

- Sign-in and sessions (`platform/src/membership/`).
- Membership, access levels and permission checks (`platform/src/membership/`, `platform/src/platform/`).
- The AI approval page, passes and `/mcp` (`platform/src/ai-connections/`, `platform/src/platform/mcp.ts`).
- Apps under `platform/apps/` and the routes that serve them.
- The build, release and deployment workflows in `.github/workflows/`.

Problems in Google sign-in, Cloudflare or another third party belong with that provider, though a report is welcome if Slice uses one of them unsafely.

## For maintainers

The [security review guide](docs/security-review.md) lists what to check when sign-in, permissions, AI connections or workflows change, what the Worker logs, and the known limits of the current protections.
