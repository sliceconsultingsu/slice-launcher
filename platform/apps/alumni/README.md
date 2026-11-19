# Alumni directory

Helps Slice consultants find alumni whose experience fits their career interests. A consultant (called a "student" in this app) saves a short profile, browses and filters alumni, and is given three alumni every 30 days with the reasons for each. An approved AI assistant can do the same through the Slice MCP connection, and an admin keeps alumni jobs current by reviewing changes the refresh proposes.

**Status: work in progress.** The code is complete for the first version described in the product requirements, with tests. It is not live: the alumni database changes (migrations 0004 to 0008) have not been applied to production, and no real alumni have been loaded. The repository contains invented people only.

Screenshots with fictional data: [home](../../../docs/images/alumni/home-desktop.png) · [matches](../../../docs/images/alumni/matches-desktop.png) · [reach out](../../../docs/images/alumni/reach-out-desktop.png) · [network](../../../docs/images/alumni/network-desktop.png) · [profile](../../../docs/images/alumni/alum-profile-desktop.png) · [first use](../../../docs/images/alumni/first-use-desktop.png) · [manage](../../../docs/images/alumni/manage-desktop.png) · [confirm details](../../../docs/images/alumni/confirm-desktop.png) · [add alumni](../../../docs/images/alumni/add-alumni-desktop.png) · [record a reply](../../../docs/images/alumni/record-reply-desktop.png). Phone-width versions of home, matches, network, profile and manage sit beside them.

## How it is organized

| Folder or file                     | What it holds                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/store.ts`                    | Changes to alumni records: add an alum, change a job, propose and review a change, merge duplicates, graduate a student                                                 |
| `data/students.ts`                 | A student's own profile and what they did with a match                                                                                                                  |
| `data/reads.ts`                    | Every read. Each takes who is asking and returns only what they may see                                                                                                 |
| `data/import.ts`                   | Loading rows from the alumni contact book                                                                                                                               |
| `data/network.ts`                  | The network as a whole: how many alumni, where they work, and what changed lately                                                                                       |
| `data/database.ts`                 | The only file that reaches the real database                                                                                                                            |
| `matching/`                        | The matching rules (`score.ts`), the settings (`config.ts`), giving a student their next set (`assign.ts`), and the first message offered after Reach out (`opener.ts`) |
| `refresh/`                         | The alumni refresh: who is due, filing a result, graduation, and the review list                                                                                        |
| `confirmation/`                    | Confirmation emails: the wording, sending, the log of who was asked, and recording a reply                                                                              |
| `mcp/tools.ts`, `refresh/tools.ts` | The assistant tools                                                                                                                                                     |
| `api.ts`                           | The API routes under `/api/apps/alumni/`                                                                                                                                |
| `ui/`                              | The screens, and their styles in `ui/alumni.css`                                                                                                                        |
| `tests/`                           | Test-only helpers: a disposable database with the fictional seed, and invented members                                                                                  |

The data dictionary, [`data/DATA-DICTIONARY.md`](data/DATA-DICTIONARY.md), describes every table and field and who may see it.

## Rules every part follows

1. **Check permission first.** Every page, API route and tool checks what the signed-in person may do before returning anything.
2. **One set of read rules.** Screens and tools read through `data/reads.ts`, so they cannot show different things.
3. **Hidden means hidden.** A hidden alum, a merged duplicate and a hidden contact detail are never shown to members or returned by a student tool.
4. **A student's answers are private.** Only the student and admins can read them. The member ID always comes from the platform, never from a request.
5. **Nothing changes an alum's profile without an admin.** The refresh files proposals; a person approves or rejects them.
6. **No real people in the code.** Tests, examples and screenshots use invented people.

## Permissions

Declared in [`app.json`](app.json). `records.read` comes with access: everyone who can open the app holds it. The other two are extra powers the app's managers give to named people on the app's page. Owners and the app's managers hold all three.

| Action         | Lets a member                                                                          |
| -------------- | -------------------------------------------------------------------------------------- |
| `records.read` | Browse alumni, keep a student profile and receive matches                              |
| `admin`        | Review proposed changes, add alumni, hide an alum or a contact detail, see hidden ones |
| `refresh.run`  | Call the three refresh tools                                                           |

A member holding `refresh.run` without `admin` cannot use a LinkedIn link an admin has hidden.

## Pages and API routes

Pages: `/apps/alumni` (home, or the three first-use steps), `/matches`, `/explore` (the network), `/alumni/<id>`, `/profile` (my answers), and for admins `/manage`, `/review`, `/add`, `/confirm` and `/alumni/<id>/reply`.

| Route                      | Method    | Needs          | Does                                                                      |
| -------------------------- | --------- | -------------- | ------------------------------------------------------------------------- |
| `alumni`                   | GET       | `records.read` | Search with filters, sorting and paging                                   |
| `alumni/<id>`              | GET       | `records.read` | One profile                                                               |
| `lists`                    | GET       | `records.read` | The fixed choices                                                         |
| `network`                  | GET       | `records.read` | Counts of listed alumni by industry and employer, and what changed lately |
| `me`                       | GET       | `records.read` | Who is signed in and their own profile                                    |
| `me/profile`               | PUT       | `records.read` | Save the student's own answers                                            |
| `me/matches`               | GET, POST | `records.read` | GET lists matches. POST also gives the next set when due                  |
| `me/matches/<id>/outcome`  | POST      | `records.read` | Record "contacted" or "not for me"                                        |
| `proposals`                | GET       | `admin`        | Pending proposed changes                                                  |
| `proposals/<id>/review`    | POST      | `admin`        | Approve or reject one                                                     |
| `alumni/<id>/listing`      | POST      | `admin`        | Hide or list an alum                                                      |
| `contacts/<id>/visibility` | POST      | `admin`        | Hide or show one contact detail                                           |
| `import`                   | POST      | `admin`        | Load up to 25 contact-book rows                                           |
| `confirmations`            | GET       | `admin`        | Where each alum stands, whether email is set up, and the email's wording  |
| `confirmations/send`       | POST      | `admin`        | Send up to 10 confirmation emails to alumni who are due                   |
| `alumni/<id>/reply`        | GET, POST | `admin`        | Read what is on file for an alum, and record their reply                  |
| `records`                  | GET       | `records.read` | The original starter's three sample records, kept for the starter tasks   |

## Assistant tools

Each appears to an assistant as `alumni__<name>`. The [guide](guide.md) lists them with an example request.

- Students (`records.read`): `search`, `get`, `lists`, `my_profile`, `update_my_profile`, `my_matches`.
- Refresh (`refresh.run`): `refresh_due`, `refresh_file`, `refresh_graduates`.

`update_my_profile`, `my_matches`, `refresh_file` and `refresh_graduates` are marked as changing data. `my_matches` is included because asking may record the student's next set. Expected refusals come back as a result with a `status`, such as `invalid_choice` with the valid choices, because the platform replaces thrown errors with one generic message.

## Settings

- Matching, in [`matching/config.ts`](matching/config.ts): three matches every 30 days, at most three students per alum in a period, and the points for each thing in common.
- Refresh, in [`refresh/config.ts`](refresh/config.ts): an alum is due 120 days after their last successful check; graduation counts from June 1.

## How the refresh works

The app never contacts LinkedIn and holds no LinkedIn-specific code except `refresh/linkedin.ts`, which builds a text address. A Slice admin's own assistant reads each alum's experience page in the admin's own browser and calls `refresh_file` with what it found. The app compares that with the stored job and logs the check. A difference becomes a proposal on the review page. Copied page text is never accepted or stored. The run instructions are kept in the product requirements document, not in this public repository.

## Confirmation emails

An admin can have the app email each listed alum to ask whether their job is still right, which contact details they are happy to share, and what they could help with. Slice decided this on 15 November 2026, reversing the earlier choice to send no email.

- **Only an admin starts a send**, on the **Confirm details** screen, in two deliberate steps. Nothing goes out on a timer.
- **One email per alum**, to the address already on file. A request cannot supply an address. Nobody is emailed twice within a year (`confirmation/config.ts`), even if two admins press send together.
- **The alum replies by email.** The reply goes to the admin who sent it, because that admin's own address is the reply-to. Alumni cannot sign in, and the app has no public page.
- **The admin records the reply** on **Record a reply**: the job, which contact details to share, any new detail, what they can help with, and whether they asked not to be listed. Shared details get the date the alum agreed. Until an alum answers, details from the contact book stay visible as before.
- **The email says only** the alum's own job and class year. It contains no address, phone number or link, and no one else's details. The wording is in `confirmation/message.ts`.
- **The log** (`alumni_confirmation_requests`) holds who was asked, when and by whom. It holds no message text and no address.
- Alumni with no email on file cannot be asked this way. The screen counts them.

The mail service is Cloudflare Email Service, which is for emails a person's own relationship with the sender explains, not marketing. A one-time request to Slice's own alumni fits; a newsletter would not.

### Switching email on

Email is off until the maintainer does all of this. Until then the screen says so and nothing can be sent.

1. Set up a sending domain that Slice controls in Cloudflare Email Service (`wrangler email sending enable <domain>`). Before a domain is set up, the service delivers only to addresses verified on the account, which is a safe way to try one email to yourself.
2. In a reviewed PR, add to `platform/wrangler.jsonc` an email binding named `ALUMNI_EMAIL`, limited to the one sending address, and that address as the variable `ALUMNI_EMAIL_FROM`:

   ```jsonc
   "send_email": [{ "name": "ALUMNI_EMAIL", "allowed_sender_addresses": ["alumni@<domain>"] }],
   "vars": { "ALUMNI_EMAIL_FROM": "alumni@<domain>" }
   ```

3. Apply migration `0008`.

## How it looks

This app has its own look, which the maintainer approved as a departure from the [design profile](../../../docs/design-profile.md). Other apps should keep following the profile.

- **People are coloured tiles.** There are no photos. Every alum is a rounded tile in one of six colours with their initials, chosen from their ID so it is always the same.
- **Matching is a deck.** One alum at a time, with **Reach out** and **Not for me**. Everything else (home, profile, network) reads like a professional network.
- **Colours and type** are Slice's logo orange and slate, with League Spartan for names and headings and DM Sans for text. Every value is named once at the top of `ui/alumni.css` and scoped to `.alumni-workspace`, so nothing leaks into the launcher or another app.
- **The font files ship with the launcher.** They come from two packages, `@fontsource/league-spartan` and `@fontsource/dm-sans`, imported at the top of `ui/app.tsx` in the five weights the screens use. A member's browser asks no other site for them, so the launcher's page security policy needs no exception. Both fonts are under the SIL Open Font License 1.1; each package carries its licence file.
- **What "Lately in the network" shows** comes from details a member can already see on a listed profile: job changes, alumni added, and help offered. A hidden alum is never named. It reaches back 180 days (`ACTIVITY_DAYS`).
- **The first message after Reach out** is built from the match's reasons (`matching/opener.ts`). The student edits it and sends it from their own email or LinkedIn. The app sends nothing.

## Preview and checks

From the repository root:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm team:dev
```

In the preview, confirmation emails go to a stand-in that sends nothing. The preview opens the real app on a disposable database filled with 30 fictional alumni and 10 fictional students, signed in as a fictional admin who has no student profile yet. The default port is 4310; prepared person workspaces use 4311 to 4315. See [workspaces](../../../docs/team/workspaces.md). Restarting the preview resets its data.

```sh
corepack pnpm --filter @slice/launcher exec vitest run apps/alumni
corepack pnpm --filter @slice/launcher exec playwright install chromium
corepack pnpm test:team
```

Before a PR run all [contributor checks](../../../CONTRIBUTING.md#4-implement-and-check).

## Before this goes live

These are the maintainer's steps and are not done by merging code:

1. Apply migrations `0004` to `0008`, in order, through the approved process in [migrations](../../../docs/migrations.md). The app's pages fail until they are applied.
2. On the app's page (**Details** on its launcher tile), name its managers, choose Public or add people by name, and tick **Manage alumni data…** (`admin`) and **Run the alumni refresh…** (`refresh.run`) for the people who should hold them. Making the app Public opens alumni contact details to every active member, and to each invited person as they sign in.
3. Load the alumni contact book on the **Add alumni** screen by pasting its rows, headings included. The screen reads the book's own columns: Name, Company, Role, Industry, Email, LinkedIn, Grad Year and Date updated. Every industry label the book uses is on the app's list, including Sales, Communications, Recruiting/HR and Other; its shorter labels Finance, Marketing and Government are understood. An unknown label is refused by row number with the industries to choose from.
4. Remove `"workInProgress": true` from `app.json` when the app is ready.

## Open items

- **Passing uses up a match.** A student gets three alumni every 30 days, and **Not for me** does not bring a replacement. They can change the decision, but not swap the alum.
- **A match is one-sided.** The alum has not agreed to anything; the student's first message is still a cold one.
- **The home list can be quiet.** With a few dozen alumni and yearly confirmations it may show only one or two entries.
- **Reading LinkedIn with an assistant** may breach LinkedIn's user agreement, and the risk falls on the account of whoever runs the check. This needs Slice's approval before the first real run.
- **Alumni cannot edit their own profiles.** They can ask not to be listed by replying to the confirmation email; an admin then hides them, which also stops them being matched.
- **Recording a reply is several changes, not one.** Each is saved with history, but if one fails partway the earlier ones stay. The form checks everything it can before saving.
- **A proposal cannot say "no current job".** The refresh sends that case to manual review.
- **A rejected proposal can leave an unused employer or city** in the reference lists. It is never offered to members.
- **Editing the fixed lists** (majors, industries, skills, kinds of help) is done by a developer for now.
- **Settling possible duplicates** has operations in `store.ts` but no screen yet.
- **Matching is only as rich as the alumni records.** The contact book holds a job and an industry but no major, city or help offered, so until those are added a match can only be explained by industry. The explorer offers a filter only when at least one listed alum has that detail, so the school, major, city and help filters appear as the records gain them.

## Icon

Original artwork created for this repository by Ivan Chen: two overlapping circles for a student and an alumnus making a connection. Released under the repository's MIT licence.

## The original starter's interfaces

This section describes the three-record learning starter the app began as. Its `records` route and the files `contracts.ts`, `fixtures.ts` and `data.ts` are kept for the starter tasks in the team guide. The app described above does not use them.

These are the development baseline for parallel work, not final client-approved requirements. Propose shared changes to Ivan before implementing them in multiple branches.

The source of truth is [`contracts.ts`](contracts.ts). All example people and companies in [`fixtures.ts`](fixtures.ts) are invented. Do not add real records to this public repository.

| Record           | Fields                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Alumni           | `id`, `name`, `graduationYear`, `company`, `role`, `industry`, `expertise[]`, `lastVerifiedAt` |
| Student          | `id`, `name`, `graduationYear`, `interests[]`, `goals`                                         |
| Match result     | `studentId`, `alumniId`, `reasons[]`                                                           |
| Refresh proposal | `alumniId`, `sourceUrl`, `retrievedAt`, `changes`, `status: "needs-review"`                    |

IDs identify records, not names. Two people may share a name. Years must be integers within the schema's bounds. Lists and strings are bounded. Unknown fields are rejected. These fields omit contact information deliberately; approve data ownership and field visibility before extending the pilot to real data.

### Working now

`GET /api/apps/alumni/records` returns `{ dataset: "synthetic", alumni: Alumnus[], students: Student[] }`. The platform requires active membership and `app.alumni.open`; the app additionally requires `app.alumni.records.read`, which comes with access to the app. HEAD has no body. Writes return 405; unknown operations return 404. The same app module serves the production platform route and the isolated learning preview.

`AlumniRepository` exposes `listAlumni(): Promise<Alumnus[]>` and `listStudents(): Promise<Student[]>`. The initial adapter is read-only and returns independent fixture copies. `readDirectory(context, repository)` enforces the read action and validates the response. UI code calls the guarded API; it never imports storage or server modules.

### Planned task interfaces

These functions do not exist yet; their task owners implement them independently:

- Data: `validateImport(rows: unknown[], existing: Alumnus[]): ImportReport`, where `ImportReport` contains `accepted: Alumnus[]`, `duplicates: string[]`, and `errors: { row: number; message: string }[]`. Rows are 1-based. Existing IDs and repeated IDs in the input are duplicates. First valid occurrence wins; invalid rows do not reserve IDs. No writes.
- Matching: `recommendMatches(student: Student, alumni: Alumnus[]): MatchResult[]`. First exercise: match a student interest to an alumni industry, case-insensitively, and explain that overlap. Keep stable alumni-ID ordering. This exercise is not the final ranking policy.
- Refresh: `proposeRefresh(current: Alumnus, candidate: unknown): RefreshProposal | null`. Candidate includes the exact alumni ID, an HTTPS source URL, a retrieval timestamp and allowed changed fields. Same values return null. Different IDs, invalid input and unsupported fields are rejected. No fetching or writing.
- MCP: a `search_alumni` definition exported from `mcp/tools.ts`, using the shared `defineAppTool` helper and a bounded `query` input. Return a clearly synthetic result from the same repository used by the API. Ivan reviews the `records.read` declaration/visibility and the small registration change in `server.tsx`.

Every operation must keep existing platform authorization. MCP and refresh must not introduce their own database, duplicate matching logic or independent login/deployment. Scheduling the refresh runner is a later platform integration decision: the current app contract does not provide app-owned cron handlers.

### Decisions still needed

Who can view each real field; who can edit profiles; how students identify themselves; recommendations versus assigned pairings; repeated-match policy; alumni availability/consent; permitted refresh sources and cadence; how verified manual edits are protected; and who approves uncertain updates. The starter does not silently decide these policies.
