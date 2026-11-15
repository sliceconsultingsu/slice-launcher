# Launcher layout evidence

[Desktop preview](desktop.png) shows the launcher at 1280 × 960 with the **Slice Consulting OS** name beside the logo and **Connect your AI** in the footer. Keyboard focus is visible on the link. [Mobile preview](mobile.png) shows the same screen at 390 × 844, where the header keeps only the logo and the account link. Both were captured November 15, 2026 from the local synthetic browser harness; no private member data is included.

The full setup guide remains at `/connect-ai`.

To reproduce, run `pnpm --filter @slice/launcher test:e2e:server`, open `http://127.0.0.1:4173/`, and inspect the launcher at 1280px and 390px wide. Stop that server before running `pnpm test:e2e`.
