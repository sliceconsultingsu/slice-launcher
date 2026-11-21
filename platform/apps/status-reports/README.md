# Status reports

Helps Slice project managers draft the three client status reports they send each semester. The app is one read-only page: a sensitive-project warning, a checklist of what to gather, a copy-and-paste prompt for the PM's own AI assistant, the report format and drafting rules, blank template wording and a fictional example. The PM reviews the draft, pastes it into the Google Slides template and sends the PDF.

This is Level 1. It is marked work in progress until project managers have tried it.

## Files

- `server.tsx`: checks the `use` permission and renders the page. No API and no MCP tools.
- `page.tsx`: the page layout, using the shared `guide-content`, `notice` and `connection-copy` styles.
- `copy-prompt.tsx`: the only client component; copies the prompt to the clipboard.
- `content.ts`: all text the page shows, including the prompt and the example. Edit wording here.
- `guide.md`: the consultant guide behind the launcher's **Details** button. It repeats the prompt; the test fails if the two differ.
- `status-reports.test.ts`: permission, page order, prompt and synthetic-data checks.
- `app.json`: public name, description and the one permission. Run `pnpm apps:sync` after editing it.

## Access and data

- One permission, `use` ("Use the status report prompt, template and example"), marked `"withAccess": true`, so everyone who can open the app holds it. There is no administration permission.
- A new app is private: only owners can open it until an owner names its managers on the app's page. Managers then make it Public or add people by name.
- The app stores nothing, has no database tables and calls no AI service. Everything it shows is fixed text in this public repository. The example client, consultants and dates are invented; never replace them with real ones.
- Sensitive and NDA projects must not go through any AI assistant. The page and guide say so before the prompt. The VP of Operations owns the sensitive-project list.

## Not built (Level 2)

Weekly check-in storage and MCP tools need Ivan's approval and a reviewed migration first. Reminders, email, filling Slides and making PDFs are out of scope.

## Icon

Original artwork created for this repository with Claude Code (Anthropic) at the request of a Slice contributor: a report page with a check mark, for a finished status report. Released under the repository's MIT licence.

## Design

Uses the shared components, tokens and copy rules in the [design profile](../../../docs/design-profile.md). The platform provides the page header and footer.

## Develop and verify

From the repository root, run `pnpm dev`; this app is at `/apps/status-reports`. Run the checks in [CONTRIBUTING.md](../../../CONTRIBUTING.md) before a PR.
