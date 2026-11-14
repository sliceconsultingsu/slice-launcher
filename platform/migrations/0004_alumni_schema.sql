-- Alumni app: tables for alumni and student profiles, matching inputs, and data upkeep.
--
-- Every table name starts with "alumni_" because all Slice apps share one database. Each table's
-- first comment line says what it is for; every column has a comment. SQLite keeps comments that
-- sit inside CREATE TABLE in the stored schema, so the descriptions travel with the database.
-- The plain-language data dictionary, including who may see each field, is
-- platform/apps/alumni/data/DATA-DICTIONARY.md.
--
-- Conventions: IDs are text. People, jobs and log rows get random IDs from the app; reference
-- lists use short readable codes such as 'whitman'. Times are UTC ISO-8601 text ending in "_at".
-- Months are 'YYYY-MM'. Yes/no columns are 0 or 1. Fixed choices use CHECK rules.
-- D1 always enforces the foreign keys (links between tables) declared below.
-- No people are inserted here. Reference lists are in 0005; fictional sample people live only in
-- the app's test seed file.

-- ---------------------------------------------------------------------------------------------
-- Reference lists (maintained by admins)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_schools (
  -- A Syracuse University school or college. Majors belong to exactly one school.
  id TEXT PRIMARY KEY, -- Short readable code, e.g. 'whitman'.
  name TEXT NOT NULL UNIQUE, -- Official name, e.g. 'Martin J. Whitman School of Management'.
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)) -- 0 retires it from new choices without deleting history.
);

CREATE TABLE alumni_majors (
  -- An academic program a person can study as a major or a minor. The school is decided here,
  -- never stored on a person, so a person's school is always derived from their majors.
  -- A FORMER program name (for example a degree an older graduate holds) is a retired entry that
  -- points at the current program replacing it. It has no school of its own: school lookup and
  -- matching use the current program, while profiles can still show the name on the degree.
  id TEXT PRIMARY KEY, -- Short readable code, e.g. 'finance'.
  name TEXT NOT NULL UNIQUE, -- Program name as shown to people (for a former name, the name on the degree).
  school_id TEXT REFERENCES alumni_schools(id), -- The one school that owns a current program; empty for a former name.
  current_major_id TEXT REFERENCES alumni_majors(id), -- For a former name only: the current program that replaced it; empty otherwise.
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), -- 0 retires it from new choices without deleting history.
  -- A current program has a school; a former name has no school, is retired, and points elsewhere.
  CHECK ((current_major_id IS NULL) = (school_id IS NOT NULL)),
  CHECK (current_major_id IS NULL OR (current_major_id <> id AND active = 0))
);
CREATE INDEX alumni_majors_school ON alumni_majors(school_id);
CREATE INDEX alumni_majors_current ON alumni_majors(current_major_id);

-- A former name must point straight at a current program (never at another former name), and a
-- program that former names point to cannot itself become a former name. This keeps every lookup
-- one step long.
CREATE TRIGGER alumni_majors_former_insert
BEFORE INSERT ON alumni_majors
WHEN NEW.current_major_id IS NOT NULL
  AND (SELECT current_major_id FROM alumni_majors WHERE id = NEW.current_major_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'A former program name must point to a current program.');
END;
CREATE TRIGGER alumni_majors_former_update
BEFORE UPDATE OF current_major_id ON alumni_majors
WHEN NEW.current_major_id IS NOT NULL
  AND ((SELECT current_major_id FROM alumni_majors WHERE id = NEW.current_major_id) IS NOT NULL
    OR EXISTS (SELECT 1 FROM alumni_majors WHERE current_major_id = NEW.id))
BEGIN
  SELECT RAISE(ABORT, 'A former program name must point to a current program.');
END;

CREATE TABLE alumni_industries (
  -- The fixed list of industries used on every job and in student interests. Admins maintain it.
  id TEXT PRIMARY KEY, -- Short readable code, e.g. 'consulting'.
  name TEXT NOT NULL UNIQUE, -- Name as shown to people.
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)) -- 0 retires it from new choices without deleting history.
);

CREATE TABLE alumni_help_kinds (
  -- The fixed list of kinds of help: alumni offer them and students seek them.
  id TEXT PRIMARY KEY, -- Short readable code, e.g. 'resume-review'.
  name TEXT NOT NULL UNIQUE, -- Name as shown to people.
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)) -- 0 retires it from new choices without deleting history.
);

CREATE TABLE alumni_locations (
  -- A city used for jobs and for students' preferred cities. Each city appears once.
  id TEXT PRIMARY KEY, -- Random or readable ID.
  city TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(city)) > 0), -- City name, e.g. 'Boston'.
  region TEXT NOT NULL DEFAULT '' COLLATE NOCASE, -- State or province, e.g. 'MA'; '' when not used, never NULL, so uniqueness works.
  country TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(country)) > 0), -- Country name, e.g. 'United States'.
  UNIQUE (city, region, country)
);

CREATE TABLE alumni_employers (
  -- An employer named on current or past jobs.
  id TEXT PRIMARY KEY, -- Random or readable ID.
  name TEXT NOT NULL CHECK (length(trim(name)) > 0), -- Name as people write it, e.g. 'Harbor & Pine Capital'.
  name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) > 0) -- Lowercase name without accents or punctuation; one employer per key.
);

-- ---------------------------------------------------------------------------------------------
-- People and identity
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_people (
  -- One row per real person, whether alumnus, student or both. Duplicates are merged, not deleted:
  -- a merged row keeps its own details and points at the record that was kept.
  id TEXT PRIMARY KEY, -- Random ID; never reused.
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 120), -- Name as the person writes it.
  name_key TEXT NOT NULL CHECK (length(name_key) > 0 AND name_key = lower(name_key)), -- full_name lowercased, without accents or punctuation; used for identity.
  disambiguator TEXT NOT NULL DEFAULT '' CHECK (disambiguator = trim(disambiguator) AND length(disambiguator) <= 40), -- Optional tie-breaker for true namesakes, e.g. a middle initial; '' when blank, never NULL.
  graduation_year INTEGER NOT NULL CHECK (graduation_year BETWEEN 1950 AND 2100), -- Year graduated, or expected year for a student.
  merged_into TEXT REFERENCES alumni_people(id) CHECK (merged_into IS NULL OR merged_into <> id), -- NULL for active records; otherwise the record this one was merged into.
  created_at TEXT NOT NULL, -- When the record was created.
  updated_at TEXT NOT NULL -- When the record last changed.
);
-- Identity rule: among records not merged away, one person per name key, year and tie-breaker.
CREATE UNIQUE INDEX alumni_people_identity
  ON alumni_people(name_key, graduation_year, disambiguator) WHERE merged_into IS NULL;
CREATE INDEX alumni_people_merged_into ON alumni_people(merged_into);

CREATE TABLE alumni_aliases (
  -- A nickname or alternate spelling of a person's name, used for search and duplicate review.
  id TEXT PRIMARY KEY, -- Random ID.
  person_id TEXT NOT NULL REFERENCES alumni_people(id), -- The person this name belongs to.
  alias TEXT NOT NULL CHECK (length(trim(alias)) BETWEEN 1 AND 120), -- The alternate name as written, e.g. 'Sammy Rivera'.
  name_key TEXT NOT NULL CHECK (length(name_key) > 0 AND name_key = lower(name_key)), -- Alias lowercased, without accents or punctuation.
  UNIQUE (person_id, name_key)
);
CREATE INDEX alumni_aliases_name_key ON alumni_aliases(name_key);

CREATE TABLE alumni_merge_candidates (
  -- Possible duplicates waiting for an admin decision. Either two stored people, or one stored
  -- person and an incoming record that was not saved because it looked like that person.
  id TEXT PRIMARY KEY, -- Random ID.
  person_id TEXT NOT NULL REFERENCES alumni_people(id), -- The existing person.
  other_person_id TEXT REFERENCES alumni_people(id), -- The other stored person, when both are already saved.
  incoming_record TEXT CHECK (incoming_record IS NULL OR json_valid(incoming_record)), -- The unsaved incoming record as JSON, when an import looked like person_id.
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0), -- Plain explanation, e.g. 'Same name and year; different email'.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'dismissed')), -- Review state.
  found_at TEXT NOT NULL, -- When the possible duplicate was found.
  reviewed_by TEXT, -- Member ID of the admin who decided; NULL while pending.
  reviewed_at TEXT, -- When the admin decided; NULL while pending.
  CHECK ((other_person_id IS NULL) <> (incoming_record IS NULL)),
  CHECK (other_person_id IS NULL OR other_person_id <> person_id),
  CHECK ((status = 'pending') = (reviewed_by IS NULL AND reviewed_at IS NULL))
);
CREATE INDEX alumni_merge_candidates_status ON alumni_merge_candidates(status, found_at);

-- ---------------------------------------------------------------------------------------------
-- Education
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_person_majors (
  -- The majors and minors a person studied. A person's schools come from these majors.
  person_id TEXT NOT NULL REFERENCES alumni_people(id), -- The person.
  major_id TEXT NOT NULL REFERENCES alumni_majors(id), -- The program studied.
  kind TEXT NOT NULL DEFAULT 'major' CHECK (kind IN ('major', 'minor')), -- Studied as a major or a minor.
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1) AND (is_primary = 0 OR kind = 'major')), -- 1 for the person's one primary major; a minor cannot be primary.
  PRIMARY KEY (person_id, major_id)
);
CREATE UNIQUE INDEX alumni_person_majors_one_primary ON alumni_person_majors(person_id) WHERE is_primary = 1;
CREATE INDEX alumni_person_majors_major ON alumni_person_majors(major_id);

-- A person's schools, always derived from their majors and minors (never stored on the person).
-- major_id and degree_name are what the person studied, as recorded (possibly a former name).
-- current_major_id, current_major_name and the school come from the current program; matching
-- and school lookup should use those.
CREATE VIEW alumni_person_schools AS
SELECT pm.person_id, pm.major_id, recorded.name AS degree_name,
       cur.id AS current_major_id, cur.name AS current_major_name,
       pm.kind, pm.is_primary, s.id AS school_id, s.name AS school_name
FROM alumni_person_majors pm
JOIN alumni_majors recorded ON recorded.id = pm.major_id
JOIN alumni_majors cur ON cur.id = COALESCE(recorded.current_major_id, recorded.id)
JOIN alumni_schools s ON s.id = cur.school_id;

-- ---------------------------------------------------------------------------------------------
-- Alumni profiles, jobs and contact details
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_profiles (
  -- The alumni side of a person: listing choice, the ONE current job and a note. Past jobs are in
  -- alumni_experiences; a job is never in both places.
  person_id TEXT PRIMARY KEY REFERENCES alumni_people(id), -- The person; at most one alumni profile each.
  member_id TEXT UNIQUE, -- Their Slice member account ID, if they have one; NULL otherwise. Not a database link to the platform's tables.
  listing_status TEXT NOT NULL DEFAULT 'listed' CHECK (listing_status IN ('listed', 'hidden')), -- 'hidden' removes them from listings without deleting anything.
  job_employer_id TEXT REFERENCES alumni_employers(id), -- Current employer; NULL when no current job is known.
  job_title TEXT CHECK (job_title IS NULL OR length(trim(job_title)) BETWEEN 1 AND 120), -- Current job title.
  job_industry_id TEXT REFERENCES alumni_industries(id), -- Industry of the current job.
  job_location_id TEXT REFERENCES alumni_locations(id), -- City of the current job; optional.
  job_start_month TEXT CHECK (job_start_month IS NULL OR job_start_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'), -- Month the current job started, 'YYYY-MM'; optional.
  job_last_verified_at TEXT, -- When the current job was last confirmed accurate.
  note TEXT CHECK (note IS NULL OR length(note) <= 2000), -- Optional free text; same audience as the listed profile; never used for matching.
  last_verified_at TEXT, -- When the profile as a whole was last confirmed accurate.
  created_at TEXT NOT NULL, -- When the profile was created.
  updated_at TEXT NOT NULL, -- When the profile last changed.
  -- A current job is either absent entirely, or has at least an employer, title and industry.
  CHECK (
    (job_employer_id IS NULL AND job_title IS NULL AND job_industry_id IS NULL AND job_location_id IS NULL
      AND job_start_month IS NULL AND job_last_verified_at IS NULL)
    OR (job_employer_id IS NOT NULL AND job_title IS NOT NULL AND job_industry_id IS NOT NULL)
  )
);
CREATE INDEX alumni_profiles_employer ON alumni_profiles(job_employer_id);
CREATE INDEX alumni_profiles_industry ON alumni_profiles(job_industry_id);
CREATE INDEX alumni_profiles_location ON alumni_profiles(job_location_id);

CREATE TABLE alumni_experiences (
  -- An alumnus's PAST job. When someone changes jobs, their current job moves here.
  id TEXT PRIMARY KEY, -- Random ID.
  person_id TEXT NOT NULL REFERENCES alumni_profiles(person_id), -- The alumnus.
  employer_id TEXT NOT NULL REFERENCES alumni_employers(id), -- Employer.
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120), -- Job title.
  industry_id TEXT NOT NULL REFERENCES alumni_industries(id), -- Industry of this job.
  location_id TEXT REFERENCES alumni_locations(id), -- City; optional.
  start_month TEXT CHECK (start_month IS NULL OR start_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'), -- 'YYYY-MM' the job started; optional.
  end_month TEXT NOT NULL CHECK (end_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'), -- 'YYYY-MM' the job ended.
  last_verified_at TEXT, -- When this job was last confirmed accurate.
  created_at TEXT NOT NULL, -- When this row was created.
  CHECK (start_month IS NULL OR start_month <= end_month)
);
CREATE INDEX alumni_experiences_person ON alumni_experiences(person_id);

CREATE TABLE alumni_contacts (
  -- One contact detail for an alumnus. Hidden by default: then only the alumnus and admins see it.
  id TEXT PRIMARY KEY, -- Random ID.
  person_id TEXT NOT NULL REFERENCES alumni_profiles(person_id), -- The alumnus.
  kind TEXT NOT NULL CHECK (kind IN ('email', 'phone', 'linkedin', 'other')), -- What sort of detail it is.
  label TEXT CHECK (label IS NULL OR length(trim(label)) BETWEEN 1 AND 60), -- Optional short description, e.g. 'Personal website' for 'other'.
  value TEXT NOT NULL CHECK (length(trim(value)) BETWEEN 1 AND 300), -- The detail as given.
  value_key TEXT NOT NULL CHECK (length(value_key) > 0), -- Normalized copy for duplicate checks (lowercase email; LinkedIn profile path).
  visibility TEXT NOT NULL DEFAULT 'hidden' CHECK (visibility IN ('hidden', 'members')), -- 'hidden': alumnus and admins only; 'members': Slice members too.
  consent_at TEXT, -- When the alumnus agreed to share it; required before it can be visible to members.
  created_at TEXT NOT NULL, -- When the detail was added.
  updated_at TEXT NOT NULL, -- When the detail last changed.
  CHECK (visibility = 'hidden' OR consent_at IS NOT NULL),
  UNIQUE (person_id, kind, value_key)
);
CREATE INDEX alumni_contacts_lookup ON alumni_contacts(kind, value_key);

CREATE TABLE alumni_help_offered (
  -- The kinds of help an alumnus offers students.
  person_id TEXT NOT NULL REFERENCES alumni_profiles(person_id), -- The alumnus.
  help_kind_id TEXT NOT NULL REFERENCES alumni_help_kinds(id), -- Kind of help offered.
  PRIMARY KEY (person_id, help_kind_id)
);
CREATE INDEX alumni_help_offered_kind ON alumni_help_offered(help_kind_id);

-- ---------------------------------------------------------------------------------------------
-- Student profiles and their matching inputs
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_student_profiles (
  -- The student side of a person. Visible only to the student, consultants and admins.
  person_id TEXT PRIMARY KEY REFERENCES alumni_people(id), -- The person; at most one student profile each.
  member_id TEXT NOT NULL UNIQUE, -- The student's Slice member account ID (required). Not a database link to the platform's tables.
  note TEXT CHECK (note IS NULL OR length(note) <= 2000), -- Optional free text; same audience as the student profile; never used for matching.
  last_verified_at TEXT, -- When the profile was last confirmed accurate.
  created_at TEXT NOT NULL, -- When the profile was created.
  updated_at TEXT NOT NULL -- When the profile last changed.
);

CREATE TABLE alumni_help_sought (
  -- The kinds of help a student is looking for.
  person_id TEXT NOT NULL REFERENCES alumni_student_profiles(person_id), -- The student.
  help_kind_id TEXT NOT NULL REFERENCES alumni_help_kinds(id), -- Kind of help sought.
  PRIMARY KEY (person_id, help_kind_id)
);

CREATE TABLE alumni_student_industries (
  -- Industries a student is interested in (several allowed).
  person_id TEXT NOT NULL REFERENCES alumni_student_profiles(person_id), -- The student.
  industry_id TEXT NOT NULL REFERENCES alumni_industries(id), -- An industry of interest.
  PRIMARY KEY (person_id, industry_id)
);

CREATE TABLE alumni_student_cities (
  -- Cities a student would like to work in (several allowed).
  person_id TEXT NOT NULL REFERENCES alumni_student_profiles(person_id), -- The student.
  location_id TEXT NOT NULL REFERENCES alumni_locations(id), -- A preferred city.
  PRIMARY KEY (person_id, location_id)
);

-- ---------------------------------------------------------------------------------------------
-- Keeping data current: allowed fields, proposals, refresh checks and history
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_change_fields (
  -- The fields that may be proposed for change or recorded in history. Anything else is refused.
  entity TEXT NOT NULL CHECK (entity IN ('person', 'alumni_profile', 'student_profile', 'contact')), -- Which kind of record.
  field TEXT NOT NULL, -- Which field of that record.
  description TEXT NOT NULL, -- Plain explanation, including how the value is written.
  PRIMARY KEY (entity, field)
);
INSERT INTO alumni_change_fields(entity, field, description) VALUES
  ('person', 'merged_into', 'Record this person was merged into (person ID); empty when active.'),
  ('alumni_profile', 'current_job', 'Whole current job, as JSON {employerId, title, industryId, locationId, startMonth}. Changing it moves the old job to past jobs.'),
  ('alumni_profile', 'job_title', 'Title of the current job (a correction, not a new job).'),
  ('alumni_profile', 'listing_status', 'listed or hidden.'),
  ('alumni_profile', 'note', 'Free-text note on the alumni profile.'),
  ('alumni_profile', 'contact_added', 'A contact detail was added, as JSON {kind, value, visibility}.'),
  ('student_profile', 'note', 'Free-text note on the student profile.'),
  ('contact', 'visibility', 'hidden or members.');

CREATE TABLE alumni_pending_changes (
  -- Proposed updates (for example from the automated refresh) waiting for review. Proposals never
  -- change profiles; only an approval applies them.
  id TEXT PRIMARY KEY, -- Random ID.
  entity TEXT NOT NULL, -- Kind of record, from alumni_change_fields.
  record_id TEXT NOT NULL, -- Which record (for profiles, the person ID).
  field TEXT NOT NULL, -- Which field, from alumni_change_fields.
  current_value TEXT, -- Value when the proposal was made; approval is refused if it has since changed.
  proposed_value TEXT NOT NULL, -- Suggested new value.
  source TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 500), -- Where the suggestion came from, e.g. a web address.
  found_at TEXT NOT NULL, -- When the source was read.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')), -- Review state.
  reviewed_by TEXT, -- Member ID of the reviewer; NULL while pending.
  reviewed_at TEXT, -- When it was reviewed; NULL while pending.
  FOREIGN KEY (entity, field) REFERENCES alumni_change_fields(entity, field),
  CHECK ((status = 'pending') = (reviewed_by IS NULL AND reviewed_at IS NULL))
);
CREATE INDEX alumni_pending_changes_status ON alumni_pending_changes(status, found_at);
CREATE INDEX alumni_pending_changes_record ON alumni_pending_changes(entity, record_id);

CREATE TABLE alumni_refresh_checks (
  -- Log of every check the refresh runner makes, one row per person and source checked, whatever
  -- the result, including failures. Admins only. The runner never writes last_verified_at on
  -- profiles; "last checked" is worked out from this log (see alumni_refresh_last_success).
  id TEXT PRIMARY KEY, -- Random ID.
  person_id TEXT NOT NULL REFERENCES alumni_people(id), -- Whose record was checked.
  source TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 500), -- The web address or other source that was checked.
  checked_at TEXT NOT NULL, -- When the check ran.
  outcome TEXT NOT NULL CHECK (outcome IN ('proposed', 'unchanged', 'unreachable', 'error', 'skipped')), -- proposed: a change was filed; unchanged: nothing new; unreachable: source could not be reached; error: the check failed; skipped: not checked.
  detail TEXT CHECK (detail IS NULL OR length(trim(detail)) BETWEEN 1 AND 200), -- Optional short explanation such as 'timed out' or 'HTTP 404'. Never page contents or personal data.
  pending_change_id TEXT REFERENCES alumni_pending_changes(id), -- The proposal this check filed: required when outcome is 'proposed', empty otherwise.
  CHECK ((outcome = 'proposed') = (pending_change_id IS NOT NULL))
);
CREATE INDEX alumni_refresh_checks_person ON alumni_refresh_checks(person_id, source, checked_at);
CREATE INDEX alumni_refresh_checks_outcome ON alumni_refresh_checks(outcome, checked_at);
CREATE INDEX alumni_refresh_checks_pending ON alumni_refresh_checks(pending_change_id);

-- The last SUCCESSFUL check of each source for each person: one where the runner reached the
-- source and compared it ('proposed' or 'unchanged'). Unreachable, error and skipped checks never
-- count. This is where "last checked" comes from; the runner does not touch profiles' dates.
CREATE VIEW alumni_refresh_last_success AS
SELECT person_id, source, max(checked_at) AS last_success_at
FROM alumni_refresh_checks
WHERE outcome IN ('proposed', 'unchanged')
GROUP BY person_id, source;

CREATE TABLE alumni_change_history (
  -- Permanent log of applied changes: edits, approved proposals, job moves, merges and reversals.
  id TEXT PRIMARY KEY, -- Random ID.
  entity TEXT NOT NULL, -- Kind of record, from alumni_change_fields.
  record_id TEXT NOT NULL, -- Which record (for profiles, the person ID).
  field TEXT NOT NULL, -- Which field, from alumni_change_fields.
  old_value TEXT, -- Value before the change; NULL when empty.
  new_value TEXT, -- Value after the change; NULL when emptied.
  actor_type TEXT NOT NULL CHECK (actor_type IN ('alumnus', 'student', 'admin', 'runner', 'system')), -- Who made it: the person themself, an admin, the refresh runner or the system.
  actor_member_id TEXT, -- Member ID for an alumnus, student or admin; NULL for runner and system.
  pending_change_id TEXT REFERENCES alumni_pending_changes(id), -- The approved proposal this came from, if any (it records the reviewer).
  changed_at TEXT NOT NULL, -- When the change was applied.
  FOREIGN KEY (entity, field) REFERENCES alumni_change_fields(entity, field),
  CHECK ((actor_type IN ('runner', 'system')) = (actor_member_id IS NULL))
);
CREATE INDEX alumni_change_history_record ON alumni_change_history(entity, record_id, changed_at);
