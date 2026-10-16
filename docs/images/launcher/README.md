# Launcher layout evidence

[Desktop preview](desktop.png) shows the launcher at 1280 × 960 with **Connect your AI** in the footer. Keyboard focus is visible on the link. Captured October 15, 2026 from the local synthetic browser harness; no private member data is included.

The full setup guide remains at `/connect-ai`. The mobile launcher screenshot could not be captured because the browser connection stopped responding during the viewport change. The existing automated setup-guide tests passed at desktop and mobile sizes, but those do not establish the launcher footer’s mobile appearance.

To reproduce, run `pnpm --filter @slice/launcher test:e2e:server`, open `http://127.0.0.1:4173/`, and inspect the launcher at 1280px and 390px wide. Stop that server before running `pnpm test:e2e`.
