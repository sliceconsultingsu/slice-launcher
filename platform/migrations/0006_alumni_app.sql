-- Alumni app: what the first version needs beyond the alumni records in 0004 and 0005.
--
-- Adds the rest of a student's first-use answers (skills, career goal, LinkedIn link), the record
-- of who was matched with whom, and one change to contact details. It follows the conventions in
-- 0004: every table starts with "alumni_", and every table and column carries a comment.
--
-- Contact details no longer need a recorded consent time before members can see them. Slice
-- decided on 2026-11-15 that details from its own alumni contact book are shown to members by
-- default; an admin can still hide any detail, and a hidden detail is never shown to members.
-- SQLite cannot drop a CHECK rule in place, so the table is rebuilt with the same columns and
-- rows. Nothing else in 0004 or 0005 is changed.

-- ---------------------------------------------------------------------------------------------
-- Student answers
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_skills (
  -- The fixed list of skills a student can say they are good at. Admins maintain it.
  id TEXT PRIMARY KEY, -- Short readable code, e.g. 'data-analysis'.
  name TEXT NOT NULL UNIQUE, -- Name as shown to people.
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)) -- 0 retires it from new choices without deleting history.
);

INSERT INTO alumni_skills(id, name) VALUES
  ('accounting', 'Accounting'),
  ('client-communication', 'Client communication'),
  ('data-analysis', 'Data analysis'),
  ('design', 'Design'),
  ('excel', 'Excel and spreadsheets'),
  ('financial-modeling', 'Financial modeling'),
  ('leadership', 'Leadership'),
  ('market-research', 'Market research'),
  ('marketing', 'Marketing'),
  ('presentations', 'Presentations'),
  ('problem-solving', 'Structured problem solving'),
  ('project-management', 'Project management'),
  ('public-speaking', 'Public speaking'),
  ('python', 'Python'),
  ('sales', 'Sales'),
  ('software-development', 'Software development'),
  ('sql', 'SQL'),
  ('writing', 'Writing');

CREATE TABLE alumni_student_skills (
  -- Skills a student says they are good at (several allowed).
  person_id TEXT NOT NULL REFERENCES alumni_student_profiles(person_id), -- The student.
  skill_id TEXT NOT NULL REFERENCES alumni_skills(id), -- A skill from the fixed list.
  PRIMARY KEY (person_id, skill_id)
);

CREATE TABLE alumni_student_answers (
  -- A student's first-use answers that are not lists. Visible only to the student and admins.
  person_id TEXT PRIMARY KEY REFERENCES alumni_student_profiles(person_id), -- The student; at most one row each.
  career_goal TEXT CHECK (career_goal IS NULL OR length(trim(career_goal)) BETWEEN 1 AND 300), -- One short sentence in the student's own words. Shown on their profile; not scored by matching.
  linkedin_url TEXT CHECK (linkedin_url IS NULL OR length(trim(linkedin_url)) BETWEEN 1 AND 300), -- The student's LinkedIn profile address, kept so it carries over when they graduate.
  updated_at TEXT NOT NULL -- When these answers last changed.
);

-- ---------------------------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_matches (
  -- One alum given to one student, with the reasons shown at the time. A student is never given
  -- the same alum twice. Visible only to the student and admins.
  id TEXT PRIMARY KEY, -- Random ID.
  student_id TEXT NOT NULL REFERENCES alumni_student_profiles(person_id), -- The student.
  alum_id TEXT NOT NULL REFERENCES alumni_profiles(person_id), -- The alum given to the student.
  round INTEGER NOT NULL CHECK (round >= 1), -- Which set of matches this is for the student: 1 for the first, then 2, and so on.
  slot INTEGER NOT NULL CHECK (slot >= 1), -- Position within the set, best match first.
  matched_at TEXT NOT NULL, -- When the set was worked out. The next set is due one period after this.
  score INTEGER NOT NULL CHECK (score > 0), -- Total from the matching rules at the time.
  reasons TEXT NOT NULL CHECK (json_valid(reasons) AND json_array_length(reasons) >= 1), -- JSON list of plain-language reasons; at least one.
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('contacted', 'not-for-me')), -- What the student said they did with the match; NULL until they say.
  outcome_at TEXT, -- When the student recorded the outcome; NULL until then.
  CHECK (student_id <> alum_id),
  CHECK ((outcome IS NULL) = (outcome_at IS NULL)),
  UNIQUE (student_id, alum_id),
  -- Two requests working out the same set at once cannot both save it.
  UNIQUE (student_id, round, slot)
);
CREATE INDEX alumni_matches_alum ON alumni_matches(alum_id, matched_at);

-- ---------------------------------------------------------------------------------------------
-- Contact details: visible to members by default, no consent time required
-- ---------------------------------------------------------------------------------------------

CREATE TABLE alumni_contacts_rebuilt (
  -- One contact detail for an alumnus. Shown to Slice members unless an admin hides it.
  id TEXT PRIMARY KEY, -- Random ID.
  person_id TEXT NOT NULL REFERENCES alumni_profiles(person_id), -- The alumnus.
  kind TEXT NOT NULL CHECK (kind IN ('email', 'phone', 'linkedin', 'other')), -- What sort of detail it is.
  label TEXT CHECK (label IS NULL OR length(trim(label)) BETWEEN 1 AND 60), -- Optional short description, e.g. 'Personal website' for 'other'.
  value TEXT NOT NULL CHECK (length(trim(value)) BETWEEN 1 AND 300), -- The detail as given.
  value_key TEXT NOT NULL CHECK (length(value_key) > 0), -- Normalized copy for duplicate checks (lowercase email; LinkedIn profile path).
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('hidden', 'members')), -- 'members': Slice members see it; 'hidden': admins only.
  consent_at TEXT, -- When the alumnus agreed to share it, if that was recorded. Optional: not needed for a detail to be visible.
  created_at TEXT NOT NULL, -- When the detail was added.
  updated_at TEXT NOT NULL, -- When the detail last changed.
  UNIQUE (person_id, kind, value_key)
);
INSERT INTO alumni_contacts_rebuilt(id, person_id, kind, label, value, value_key, visibility, consent_at, created_at, updated_at)
  SELECT id, person_id, kind, label, value, value_key, visibility, consent_at, created_at, updated_at
  FROM alumni_contacts;
DROP INDEX alumni_contacts_lookup;
DROP TABLE alumni_contacts;
ALTER TABLE alumni_contacts_rebuilt RENAME TO alumni_contacts;
CREATE INDEX alumni_contacts_lookup ON alumni_contacts(kind, value_key);
