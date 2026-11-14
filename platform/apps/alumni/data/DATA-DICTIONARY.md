# Alumni data dictionary

This is the plain-language guide to the alumni app's database: what each table and field means, and who may see it. The tables are created by [`0004_alumni_schema.sql`](../../../migrations/0004_alumni_schema.sql). The starting lists are in [`0005_alumni_reference_lists.sql`](../../../migrations/0005_alumni_reference_lists.sql). The same descriptions also appear as comments inside the database.

**Status:** proposed schema for review. It is not yet applied to production, and the app's screens, API, matching, MCP tools and refresh runner do not use it yet. Teammates building those parts read from and write to these tables through [`store.ts`](store.ts).

## Who can see what

The database stores the visibility choices. **The app code must enforce them**: the database cannot know who is asking. Every screen, API route and MCP tool must check permissions before returning data.

| Audience                   | Who that is                                                                     | Can see                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Admins**                 | Members granted the alumni admin permission (proposed below)                    | Everything, including hidden contact details, unlisted alumni, duplicates, proposals and history                                                                                                       |
| **The alumnus**            | The person whose alumni profile is linked to their member account (`member_id`) | Their own full profile, including hidden contact details                                                                                                                                               |
| **Slice members**          | Active members with alumni app access (`app.alumni.records.read`)               | **Listed** alumni only (listing status `listed`, not merged): name, tie-breaker, graduation year, majors and schools, current and past jobs, kinds of help, note, and contact details marked `members` |
| **The student**            | The member linked to a student profile                                          | Their own student profile                                                                                                                                                                              |
| **Consultants**            | Members granted the student-profile permission (proposed below)                 | Student profiles                                                                                                                                                                                       |
| **Behind the scenes only** | App code, never shown directly                                                  | Name keys, normalized contact keys, member IDs                                                                                                                                                         |

**Proposed permissions (not declared yet).** Ivan owns `app.json`, where permissions are declared. These names are a suggestion for that change:

- `students.read`: view student profiles (consultants and admins).
- `admin`: manage alumni data, see hidden details, review duplicates and proposals.

Students also sign in as members. So "student vs. consultant" must come from these permissions, never from the student table alone.

## Conventions

- **IDs** are text. People and log rows get random IDs. List entries use short readable codes such as `whitman` or `finance`.
- **Times** (`..._at`) are UTC date-times, for example `2026-11-13T15:00:00.000Z`. **Months** are written `YYYY-MM`.
- **"Active"** on a list entry: `1` means it can be chosen, `0` means retired. Retiring hides an entry from new choices but keeps old records intact.
- **Name key:** the name lowercased, with accents removed, hyphens and slashes turned into spaces, and other punctuation removed. "Renée O'Neil-Smith" becomes `renee oneil smith`. It is used to recognize the same person.
- Nothing is deleted to "remove" a person. Alumni are hidden with the listing status, and duplicates are merged.

## Reference lists (admins maintain these)

### `alumni_schools`: Syracuse schools and colleges

Visible to anyone who can see profiles.

| Field    | Meaning                                                      |
| -------- | ------------------------------------------------------------ |
| `id`     | Short code, e.g. `whitman`                                   |
| `name`   | Official name, e.g. "Martin J. Whitman School of Management" |
| `active` | 1 = can be chosen; 0 = retired                               |

### `alumni_majors`: academic programs

Each current program belongs to **exactly one** school. A person's school is always worked out from their majors, never typed in. Visible to anyone who can see profiles.

| Field              | Meaning                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `id`               | Short code, e.g. `finance`                                                                                |
| `name`             | Program name. For a former name, the name printed on the degree.                                          |
| `school_id`        | The school that owns a current program. Empty for a former name, which uses its current program's school. |
| `current_major_id` | Former names only: the current program that replaced it. Empty for current programs.                      |
| `active`           | 1 = can be chosen; 0 = retired. Former names are always retired.                                          |

The starting list was checked against Syracuse's official 2026–27 undergraduate catalog on 13 November 2026.

**Maxwell School majors.** The Maxwell School's section of the catalog names these as its undergraduate degrees, and they are assigned to Maxwell: Anthropology; Economics; Environment, Sustainability, and Policy; Geography; History; International Relations; Law, Society, and Policy; Policy Studies; Political Science; Public Health; Sociology. That is 11 majors. Some are offered as both a BA and a BS, but this list records the major, not the degree type. The catalog files these programs' own pages under Arts and Sciences, and Maxwell describes offering them "in partnership with the College of Arts and Sciences". Each major can belong to only one school, so they are assigned to Maxwell, whose section lists them. Human Development and Family Science is an Arts and Sciences department and stays there.

**Former degree names.** Older graduates may hold a degree whose program has since been renamed or replaced. Such a name is stored as a retired entry that points at today's program:

- A profile can show the name on the person's degree.
- Matching and school lookup use the current program.
- New students can't choose a former name, because it is retired.
- A former name must point straight at a current program, never at another former name. The database refuses anything else.

The starting list contains only the four former names actually found in the catalog's archived 2024–25 and 2025–26 editions:

| Former name on the degree             | Current program       | Evidence                                                                                                     |
| ------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Applied Data Analytics                | Applied Data Science  | Same catalog page, renamed between the 2024–25 and 2025–26 editions                                          |
| Magazine, News and Digital Journalism | Journalism            | "Not admitting after Fall 2024" while Journalism began admitting in Fall 2025; the link is implied by timing |
| Broadcast and Digital Journalism      | Journalism            | Same as above                                                                                                |
| Graphic Design                        | Visual Communications | "Not admitting students"; **the catalog names no successor**, so this link is a best match to confirm        |

**Admins can add more former names when real alumni data comes in.** Add a retired entry with no school, pointing at the current program, whenever a graduate's degree name isn't on the list. Older names from before the archived editions will need checking against the graduate's records, since the online catalog keeps only recent editions.

### `alumni_industries`: the fixed industry list

Used on every job and in students' interests. Visible to everyone who can see profiles. Fields: `id`, `name`, `active`.

Starting list: Consulting; Financial Services; Accounting; Technology; Media and Entertainment; Marketing and Advertising; Healthcare and Life Sciences; Consumer Products and Retail; Real Estate; Government and Public Policy; Nonprofit and Education; Energy and Utilities; Manufacturing and Industrials; Sports; Legal.

### `alumni_help_kinds`: kinds of help

Alumni offer these and students seek them. Fields: `id`, `name`, `active`.

Starting list: Career advice; Industry insight; Resume review; Interview prep; Case interview practice; Introductions.

### `alumni_locations`: cities

Used for jobs and students' preferred cities. Each city, region and country combination appears once.

| Field     | Meaning                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `id`      | ID                                                                                                      |
| `city`    | City, e.g. "Boston"                                                                                     |
| `region`  | State or province, e.g. "MA"; empty text (never "no value") when not used, so each city is still unique |
| `country` | Country, e.g. "United States"                                                                           |

### `alumni_employers`: employers

| Field      | Meaning                                                                          | Who sees                   |
| ---------- | -------------------------------------------------------------------------------- | -------------------------- |
| `id`       | ID                                                                               | Behind the scenes          |
| `name`     | Name as written, e.g. "Harbor & Pine Capital"                                    | Anyone who can see the job |
| `name_key` | Name key of the employer, e.g. `harbor pine capital`. Only one employer per key. | Behind the scenes          |

## People and identity

### `alumni_people`: one row per real person

A person can be an alumnus, a student or both. Their identity is **name key + graduation year + tie-breaker**. Among records that are not merged away, that combination must be unique.

| Field                      | Meaning                                                                                                                                                                                                      | Who sees                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `id`                       | Random ID, never reused                                                                                                                                                                                      | Behind the scenes              |
| `full_name`                | Name as the person writes it                                                                                                                                                                                 | Same audience as their profile |
| `name_key`                 | Name key (see conventions)                                                                                                                                                                                   | Behind the scenes              |
| `disambiguator`            | Optional tie-breaker for two genuinely different people with the same name and year, e.g. a middle initial "J.". Stored as empty text when blank, never as "no value", so the uniqueness rule still applies. | Same audience as their profile |
| `graduation_year`          | Year graduated (alumni) or expected (students), 1950–2100                                                                                                                                                    | Same audience as their profile |
| `merged_into`              | Empty for active records. For a duplicate, the record it was merged into.                                                                                                                                    | Admins                         |
| `created_at`, `updated_at` | When the record was created and last changed                                                                                                                                                                 | Admins                         |

### `alumni_aliases`: nicknames and alternate spellings

Used for search and for spotting possible duplicates. For example, "Sammy Rivera" for Samantha Rivera-Lopez. Visible to admins; used behind the scenes for search.

| Field       | Meaning                       |
| ----------- | ----------------------------- |
| `id`        | ID                            |
| `person_id` | The person                    |
| `alias`     | The alternate name as written |
| `name_key`  | Its name key                  |

### `alumni_merge_candidates`: possible duplicates for an admin to decide

**Admins only.** A row holds either two stored people, or one stored person plus an incoming record that was **not saved** because it looked like that person.

| Field             | Meaning                                                                       |
| ----------------- | ----------------------------------------------------------------------------- |
| `id`              | ID                                                                            |
| `person_id`       | The existing person                                                           |
| `other_person_id` | The other stored person (when both are saved)                                 |
| `incoming_record` | The unsaved incoming record, as JSON (when an import looked like `person_id`) |
| `reason`          | Plain explanation, e.g. "same name and year, but the email differs"           |
| `status`          | `pending`, `merged` or `dismissed`                                            |
| `found_at`        | When it was found                                                             |
| `reviewed_by`     | Member ID of the deciding admin (empty while pending)                         |
| `reviewed_at`     | When decided (empty while pending)                                            |

**Duplicate rules:**

1. **New person:** no active person has the same name key, year and tie-breaker, so a new record is created.
2. **Exact match, attached automatically:** same name key, year and tie-breaker, **and** at least one shared email or LinkedIn, **and** no conflicting email or LinkedIn. The incoming record is treated as that existing person. Any new contact details are added, hidden.
3. **Sent to review:** same name key and year, but the email or LinkedIn **conflicts**, or nothing confirms the match. Nothing is saved to profiles. The incoming record waits here for an admin.

Looser matches, such as an alias match or a year one apart, belong here too, but **nothing detects them yet**: that is the import task's job. There is also no operation yet for an admin to resolve an incoming record that is waiting here (attach it, add it as a namesake, or dismiss it). Sending a record here is not logged in the change history; this table is its record.

**Merging:** an admin merges a duplicate into the record being kept. Nothing is deleted. The duplicate keeps all its own rows, and `merged_into` points at the kept record. Each merge and reversal is logged in the change history.

- Both records must be active (not already merged), and a record can't be merged into itself.
- A record that other records are already merged into can't itself be merged away. Merge the other way round, or reverse those merges first. This keeps every duplicate pointing straight at a live record.
- Reversing a merge makes the duplicate active again. It is refused if another active record has since taken the same name, year and tie-breaker.

## Education

### `alumni_person_majors`: what a person studied

Visible to the same audience as the person's profile.

| Field        | Meaning                                                                |
| ------------ | ---------------------------------------------------------------------- |
| `person_id`  | The person                                                             |
| `major_id`   | The program                                                            |
| `kind`       | `major` or `minor`                                                     |
| `is_primary` | 1 for the person's single primary major. A minor can never be primary. |

### `alumni_person_schools` (a saved query, not a table)

Lists each person's majors with the school each belongs to. Because it is worked out live, moving a program to another school updates everyone at once.

| Column                                   | Meaning                                                             | Use it for                     |
| ---------------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| `person_id`, `kind`, `is_primary`        | As in `alumni_person_majors`                                        |                                |
| `major_id`, `degree_name`                | What the person studied, as recorded; may be a former name          | Showing the name on the degree |
| `current_major_id`, `current_major_name` | Today's program (the same as `major_id` unless it is a former name) | Matching                       |
| `school_id`, `school_name`               | The school of today's program                                       | Showing or filtering by school |

## Alumni profiles

### `alumni_profiles`: the alumni side of a person

**Listed** profiles are visible to Slice members. **Hidden** ones are visible only to the alumnus and admins. A merged record is never shown in listings.

| Field                      | Meaning                                                                                                      | Who sees                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `person_id`                | The person (one alumni profile each)                                                                         | Behind the scenes          |
| `member_id`                | Their Slice member account, if they have one. Plain text, not a hard database link to the platform's tables. | Behind the scenes / admins |
| `listing_status`           | `listed` or `hidden`. Hidden removes them from listings without deleting history.                            | Alumnus, admins            |
| `job_employer_id`          | Current employer                                                                                             | Profile audience           |
| `job_title`                | Current title                                                                                                | Profile audience           |
| `job_industry_id`          | Industry of the current job                                                                                  | Profile audience           |
| `job_location_id`          | City of the current job (optional)                                                                           | Profile audience           |
| `job_start_month`          | When the current job started (optional)                                                                      | Profile audience           |
| `job_last_verified_at`     | When the current job was last confirmed                                                                      | Profile audience           |
| `note`                     | Optional free text. Same audience as the listed profile. **Never used for matching.**                        | Profile audience           |
| `last_verified_at`         | When the whole profile was last confirmed                                                                    | Profile audience           |
| `created_at`, `updated_at` | When created and last changed                                                                                | Admins                     |

**One current job.** A current job has an employer, a title and an industry, or the job fields are empty entirely. Partial jobs are refused. Changing jobs (with `changeJob`) moves the current job into past jobs in the same step, so a job is never in both places.

### `alumni_experiences`: past jobs

Same audience as the profile. Fields: `id`, `person_id`, `employer_id`, `title`, `industry_id`, `location_id` (optional), `start_month` (optional), `end_month`, `last_verified_at`, `created_at`. The end month can't be before the start month.

### `alumni_contacts`: contact details, one row each

| Field                      | Meaning                                                                                     | Who sees                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`                       | ID                                                                                          | Behind the scenes                                                    |
| `person_id`                | The alumnus                                                                                 | Behind the scenes                                                    |
| `kind`                     | `email`, `phone`, `linkedin` or `other`                                                     | As below                                                             |
| `label`                    | Optional description, e.g. "Personal website"                                               | As below                                                             |
| `value`                    | The detail itself                                                                           | **`hidden`: alumnus and admins only. `members`: Slice members too.** |
| `value_key`                | Normalized copy for duplicate checks (lowercase email; LinkedIn profile path; phone digits) | Behind the scenes                                                    |
| `visibility`               | **`hidden` by default**, or `members`                                                       | Alumnus, admins                                                      |
| `consent_at`               | When the alumnus agreed to share it. A detail **cannot** be set to `members` without this.  | Alumnus, admins                                                      |
| `created_at`, `updated_at` | When added and last changed                                                                 | Admins                                                               |

### `alumni_help_offered`: kinds of help an alumnus offers

Same audience as the profile. Fields: `person_id`, `help_kind_id`.

## Student profiles

### `alumni_student_profiles`: the student side of a person

**Visible only to the student, consultants and admins.** Never shown in alumni listings.

| Field                      | Meaning                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `person_id`                | The person (one student profile each)                                                  |
| `member_id`                | The student's Slice member account (required). Plain text, not a hard database link.   |
| `note`                     | Optional free text. Same audience as the student profile. **Never used for matching.** |
| `last_verified_at`         | When last confirmed                                                                    |
| `created_at`, `updated_at` | When created and last changed                                                          |

Majors and graduation year come from `alumni_person_majors` and `alumni_people`.

### Student matching inputs (same audience as the student profile)

- `alumni_student_industries` (`person_id`, `industry_id`): industries of interest, several allowed.
- `alumni_student_cities` (`person_id`, `location_id`): preferred cities, several allowed.
- `alumni_help_sought` (`person_id`, `help_kind_id`): kinds of help wanted.

**Matching uses only structured fields:** major (the current program, `current_major_id` in `alumni_person_schools`, so a former degree name matches its replacement), school (derived), graduation year, industry, employer, city and kinds of help. Free-text notes are never matching inputs.

## Keeping data current

### `alumni_change_fields`: which fields may change through proposals or appear in history

**Admins only.** Anything not on this list is refused by the database.

| Entity            | Field            | Meaning                                                                                                            |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `person`          | `merged_into`    | Merge or reversal                                                                                                  |
| `alumni_profile`  | `current_job`    | A whole new job, as JSON `{employerId, title, industryId, locationId, startMonth}`; the old one moves to past jobs |
| `alumni_profile`  | `job_title`      | Correction to the current title (not a new job)                                                                    |
| `alumni_profile`  | `listing_status` | Listed or hidden                                                                                                   |
| `alumni_profile`  | `note`           | The free-text note                                                                                                 |
| `alumni_profile`  | `contact_added`  | A contact detail added when a matching record was attached                                                         |
| `student_profile` | `note`           | The student's note                                                                                                 |
| `contact`         | `visibility`     | Hidden or shared with members                                                                                      |

### `alumni_pending_changes`: proposed updates waiting for review

**Admins only.** The automated refresh writes here and **never** to profile tables. Only an admin's approval applies a proposal.

- **One proposal per field.** There is no grouping of proposals. A whole new job is proposed as one item (`current_job`) carrying employer, title, industry, location and start month together, so it is reviewed and applied as a unit.
- **Outdated proposals:** approval is refused, and the proposal stays pending, if the field has changed since the proposal was made. That way an outdated suggestion can't overwrite a newer edit. The admin can then reject it.
- **Two admins at once:** a proposal is applied at most once. If another admin reviews it at the same moment, the second approval is refused and the first decision stands.
- **What is logged:** an approved proposal's change goes into the change history as made by `runner`, linked to the proposal (which records the reviewer). This applies whoever filed the proposal. A rejection is recorded only in this table's `status`. A refused approval leaves no record anywhere.

| Field            | Meaning                                         |
| ---------------- | ----------------------------------------------- |
| `id`             | ID                                              |
| `entity`         | Kind of record (from the allowed list)          |
| `record_id`      | Which record (for profiles, the person ID)      |
| `field`          | Which field (from the allowed list)             |
| `current_value`  | The value when the proposal was made            |
| `proposed_value` | The suggested new value                         |
| `source`         | Where it came from, e.g. a web address          |
| `found_at`       | When the source was read                        |
| `status`         | `pending`, `approved` or `rejected`             |
| `reviewed_by`    | Member ID of the reviewer (empty while pending) |
| `reviewed_at`    | When reviewed (empty while pending)             |

### `alumni_change_history`: permanent log of applied changes

**Admins only**, because old values can include hidden details. Edits by an alumnus, student or admin apply immediately and are logged here, as are approved proposals, job changes, contact details added when a record is attached, merges and reversals.

**Not logged here:** creating a new person, filing a proposal, rejecting a proposal (see its `status`), sending an incoming record for duplicate review (see `alumni_merge_candidates`), and any change that was refused or rolled back.

| Field                          | Meaning                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `id`                           | ID                                                                                                      |
| `entity`, `record_id`, `field` | What changed                                                                                            |
| `old_value`                    | Value before (empty if none)                                                                            |
| `new_value`                    | Value after (empty if cleared)                                                                          |
| `actor_type`                   | Who made the change: `alumnus`, `student`, `admin`, `runner` (an approved refresh proposal) or `system` |
| `actor_member_id`              | Member ID for an alumnus, student or admin; empty for runner and system                                 |
| `pending_change_id`            | The proposal it came from, if any. That proposal records who approved it.                               |
| `changed_at`                   | When it was applied                                                                                     |

## Sample data

[`seed.sql`](seed.sql) holds 30 **fictional** alumni and 10 **fictional** students for tests and local previews. It is deliberately not a migration, so it can never reach production. Every email address uses the reserved `example.com` domain. Phone numbers use the 555-01xx range reserved for fiction.

## Open questions

- **Graphic Design → Visual Communications.** The catalog names no successor for Graphic Design. Someone who knows Newhouse's history should confirm the link.
- **Maxwell majors shared with Arts and Sciences.** A graduate's school is shown as Maxwell for these majors, although the catalog files them under Arts and Sciences too. If Slice wants such alumni to appear under both schools, that needs a schema change (a major linked to more than one school).
