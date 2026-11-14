-- Alumni app: FICTIONAL sample data for tests and local previews only.
--
-- Every person, employer, email address, phone number and web address here is invented. Email
-- addresses use the reserved example.com domain; phone numbers use the 555-01xx range reserved for
-- fiction. This file is NOT a migration and must never be loaded into production.
--
-- Requires migrations 0004 and 0005. What it demonstrates:
--   * Duplicate-looking names: two different Jordan Averys (2015 and 2018); two Taylor Morgans in
--     2019 told apart by a tie-breaker; Chris O'Neil vs Christopher ONeil awaiting admin review;
--     Patrick Kim already merged into Pat Kim (kept, logged, reversible).
--   * Accents and punctuation in names: Renée Dubois, Mei-Lin Zhao, Samantha Rivera-Lopez (aliases).
--   * Hidden contact details (the default) and a few shared with recorded consent.
--   * A job change: Marcus Bellweather's old job moved to past jobs.
--   * Former degree names: Elena Kowalczyk holds Magazine, News and Digital Journalism and Priya
--     Natarajan holds Applied Data Analytics; both map to today's program and school.
--   * Dual majors across schools, a minor, an alumnus hidden from listings, and pending,
--     approved and rejected refresh proposals.

INSERT INTO alumni_locations(id, city, region, country) VALUES
  ('loc-nyc', 'New York', 'NY', 'United States'),
  ('loc-bos', 'Boston', 'MA', 'United States'),
  ('loc-syr', 'Syracuse', 'NY', 'United States'),
  ('loc-dc', 'Washington', 'DC', 'United States'),
  ('loc-chi', 'Chicago', 'IL', 'United States'),
  ('loc-sf', 'San Francisco', 'CA', 'United States'),
  ('loc-phl', 'Philadelphia', 'PA', 'United States'),
  ('loc-clt', 'Charlotte', 'NC', 'United States'),
  ('loc-la', 'Los Angeles', 'CA', 'United States'),
  ('loc-sea', 'Seattle', 'WA', 'United States'),
  ('loc-lon', 'London', '', 'United Kingdom');

INSERT INTO alumni_employers(id, name, name_key) VALUES
  ('emp-harbor-pine', 'Harbor & Pine Capital', 'harbor pine capital'),
  ('emp-bluestone', 'Bluestone Advisory Group', 'bluestone advisory group'),
  ('emp-orchard', 'Orchard Lane Analytics', 'orchard lane analytics'),
  ('emp-lakeview', 'Lakeview Health Partners', 'lakeview health partners'),
  ('emp-northgate', 'Northgate Media Co.', 'northgate media co'),
  ('emp-quarry', 'Quarry Street Consulting', 'quarry street consulting'),
  ('emp-tidewell', 'Tidewell Energy', 'tidewell energy'),
  ('emp-maplecrest', 'Maplecrest Retail', 'maplecrest retail'),
  ('emp-silverline', 'Silverline Software', 'silverline software'),
  ('emp-copperfield', 'Copperfield Accounting LLP', 'copperfield accounting llp'),
  ('emp-riverbend', 'Riverbend Public Policy Institute', 'riverbend public policy institute'),
  ('emp-summit-arc', 'Summit Arc Realty', 'summit arc realty'),
  ('emp-ironwood', 'Ironwood Manufacturing', 'ironwood manufacturing'),
  ('emp-kestrel', 'Kestrel Sports Group', 'kestrel sports group'),
  ('emp-finch-rowe', 'Finch & Rowe LLP', 'finch rowe llp'),
  ('emp-elm-street', 'Elm Street Nonprofit Alliance', 'elm street nonprofit alliance');

-- 30 alumni and 10 students. All share one created/updated time for simplicity.
INSERT INTO alumni_people(id, full_name, name_key, disambiguator, graduation_year, merged_into, created_at, updated_at) VALUES
  ('p-a01', 'Jordan Avery', 'jordan avery', '', 2015, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a02', 'Jordan Avery', 'jordan avery', '', 2018, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a03', 'Taylor Morgan', 'taylor morgan', '', 2019, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a04', 'Taylor Morgan', 'taylor morgan', 'J.', 2019, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a05', 'Chris O''Neil', 'chris oneil', '', 2016, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a06', 'Christopher ONeil', 'christopher oneil', '', 2016, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a07', 'Samantha Rivera-Lopez', 'samantha rivera lopez', '', 2014, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a08', 'Renée Dubois', 'renee dubois', '', 2012, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a09', 'Marcus Bellweather', 'marcus bellweather', '', 2017, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a10', 'Priya Natarajan', 'priya natarajan', '', 2020, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a11', 'Devon Okafor', 'devon okafor', '', 2013, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a12', 'Mei-Lin Zhao', 'mei lin zhao', '', 2018, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a13', 'Elena Kowalczyk', 'elena kowalczyk', '', 2011, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a14', 'Hassan Farouk', 'hassan farouk', '', 2019, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a15', 'Grace Whitfield', 'grace whitfield', '', 2016, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a16', 'Omar Castellanos', 'omar castellanos', '', 2015, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a17', 'Hannah Lindqvist', 'hannah lindqvist', '', 2021, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a18', 'Theo Marchetti', 'theo marchetti', '', 2010, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a19', 'Aisha Bello', 'aisha bello', '', 2022, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a20', 'Ben Gutierrez', 'ben gutierrez', '', 2014, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a21', 'Nora Feldman', 'nora feldman', '', 2009, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a22', 'Isaac Thornbury', 'isaac thornbury', '', 2012, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a23', 'Lucia Ferraro', 'lucia ferraro', '', 2017, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a24', 'Kai Nakamura', 'kai nakamura', '', 2020, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a25', 'Rachel Abernathy', 'rachel abernathy', '', 2013, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a26', 'Victor Osei', 'victor osei', '', 2018, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a27', 'Pat Kim', 'pat kim', '', 2015, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a28', 'Patrick Kim', 'patrick kim', '', 2015, 'p-a27', '2026-10-01T12:00:00.000Z', '2026-10-02T09:00:00.000Z'),
  ('p-a29', 'Simone Delacroix', 'simone delacroix', '', 2011, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a30', 'Felix Brandt', 'felix brandt', '', 2016, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s01', 'Riley Chen', 'riley chen', '', 2027, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s02', 'Amara Okonkwo', 'amara okonkwo', '', 2028, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s03', 'Lucas Brennan', 'lucas brennan', '', 2027, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s04', 'Sofia Marquez', 'sofia marquez', '', 2029, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s05', 'Ethan Park', 'ethan park', '', 2028, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s06', 'Zoe Adler', 'zoe adler', '', 2027, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s07', 'Noah Whitaker', 'noah whitaker', '', 2028, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s08', 'Isabella Rossi', 'isabella rossi', '', 2029, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s09', 'Jamal Carter', 'jamal carter', '', 2027, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s10', 'Maya Goldberg', 'maya goldberg', '', 2028, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z');

INSERT INTO alumni_aliases(id, person_id, alias, name_key) VALUES
  ('alias-01', 'p-a07', 'Sam Rivera-Lopez', 'sam rivera lopez'),
  ('alias-02', 'p-a07', 'Sammy Rivera', 'sammy rivera'),
  ('alias-03', 'p-a05', 'Christopher O''Neil', 'christopher oneil'),
  ('alias-04', 'p-a27', 'Patrick Kim', 'patrick kim');

-- Dual majors across schools: p-a01 (Whitman + Arts and Sciences), p-a05 (Newhouse + Whitman),
-- p-a10 (Whitman + Information Studies), p-a17 (Arts and Sciences + Newhouse), p-s05.
INSERT INTO alumni_person_majors(person_id, major_id, kind, is_primary) VALUES
  ('p-a01', 'finance', 'major', 1), ('p-a01', 'economics', 'major', 0),
  ('p-a02', 'marketing-management', 'major', 1),
  ('p-a03', 'accounting', 'major', 1),
  ('p-a04', 'computer-science', 'major', 1),
  ('p-a05', 'public-relations', 'major', 1), ('p-a05', 'marketing-management', 'major', 0),
  ('p-a06', 'public-relations', 'major', 1),
  ('p-a07', 'economics', 'major', 1), ('p-a07', 'political-science', 'major', 0),
  ('p-a08', 'international-relations', 'major', 1), ('p-a08', 'economics', 'minor', 0),
  ('p-a09', 'management', 'major', 1),
  ('p-a10', 'business-analytics', 'major', 1), ('p-a10', 'applied-data-analytics', 'major', 0),
  ('p-a11', 'supply-chain-management', 'major', 1),
  ('p-a12', 'accounting', 'major', 1), ('p-a12', 'mathematics', 'minor', 0),
  ('p-a13', 'magazine-news-digital-journalism', 'major', 1),
  ('p-a14', 'mechanical-engineering', 'major', 1),
  ('p-a15', 'real-estate', 'major', 1),
  ('p-a16', 'sport-management', 'major', 1),
  ('p-a17', 'psychology', 'major', 1), ('p-a17', 'advertising', 'major', 0),
  ('p-a18', 'finance', 'major', 1),
  ('p-a19', 'information-management-technology', 'major', 1),
  ('p-a20', 'political-science', 'major', 1),
  ('p-a21', 'retail-management', 'major', 1),
  ('p-a22', 'economics', 'major', 1),
  ('p-a23', 'entrepreneurship', 'major', 1),
  ('p-a24', 'computer-engineering', 'major', 1),
  ('p-a25', 'public-relations', 'major', 1),
  ('p-a26', 'finance', 'major', 1),
  ('p-a27', 'management', 'major', 1),
  ('p-a28', 'management', 'major', 1),
  ('p-a29', 'television-radio-film', 'major', 1),
  ('p-a30', 'civil-engineering', 'major', 1),
  ('p-s01', 'finance', 'major', 1), ('p-s01', 'economics', 'major', 0),
  ('p-s02', 'public-relations', 'major', 1),
  ('p-s03', 'computer-science', 'major', 1),
  ('p-s04', 'accounting', 'major', 1),
  ('p-s05', 'business-analytics', 'major', 1), ('p-s05', 'information-management-technology', 'major', 0),
  ('p-s06', 'political-science', 'major', 1), ('p-s06', 'policy-studies', 'major', 0),
  ('p-s07', 'sport-management', 'major', 1),
  ('p-s08', 'real-estate', 'major', 1),
  ('p-s09', 'mechanical-engineering', 'major', 1),
  ('p-s10', 'psychology', 'major', 1);

-- Alumni profiles. p-a01 and p-a09 have Slice member accounts; the rest do not.
-- p-a18 is hidden from listings. p-a06, p-a23 and p-a28 have no current job.
INSERT INTO alumni_profiles(person_id, member_id, listing_status, job_employer_id, job_title, job_industry_id, job_location_id, job_start_month, job_last_verified_at, note, last_verified_at, created_at, updated_at) VALUES
  ('p-a01', 'member-example-22', 'listed', 'emp-harbor-pine', 'Associate', 'financial-services', 'loc-nyc', '2019-06', '2026-09-15T12:00:00.000Z', 'Happy to talk about moving from audit to investing.', '2026-09-15T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a02', NULL, 'listed', 'emp-northgate', 'Brand Strategist', 'marketing-advertising', 'loc-chi', '2021-02', '2026-08-01T12:00:00.000Z', NULL, '2026-08-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a03', NULL, 'listed', 'emp-copperfield', 'Senior Auditor', 'accounting', 'loc-bos', '2019-09', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a04', NULL, 'listed', 'emp-silverline', 'Software Engineer', 'technology', 'loc-sea', '2020-01', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a05', NULL, 'listed', 'emp-bluestone', 'Manager', 'consulting', 'loc-nyc', '2022-05', '2026-07-01T12:00:00.000Z', NULL, '2026-07-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a06', NULL, 'listed', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a07', NULL, 'listed', 'emp-riverbend', 'Policy Analyst', 'government-public-policy', 'loc-dc', '2018-08', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a08', NULL, 'listed', 'emp-harbor-pine', 'Vice President', 'financial-services', 'loc-lon', '2020-03', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a09', 'member-example-21', 'listed', 'emp-quarry', 'Senior Consultant', 'consulting', 'loc-bos', '2024-03', '2026-09-20T12:00:00.000Z', 'Former Slice project lead.', '2026-09-20T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a10', NULL, 'listed', 'emp-orchard', 'Data Analyst', 'technology', 'loc-sf', '2020-07', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a11', NULL, 'listed', 'emp-ironwood', 'Operations Director', 'manufacturing-industrials', 'loc-clt', '2016-04', '2026-09-05T12:00:00.000Z', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a12', NULL, 'listed', 'emp-copperfield', 'Tax Senior', 'accounting', 'loc-nyc', '2018-09', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a13', NULL, 'listed', 'emp-northgate', 'Editor', 'media-entertainment', 'loc-nyc', '2015-01', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a14', NULL, 'listed', 'emp-tidewell', 'Project Engineer', 'energy-utilities', 'loc-phl', '2019-08', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a15', NULL, 'listed', 'emp-summit-arc', 'Acquisitions Associate', 'real-estate', 'loc-clt', '2016-07', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a16', NULL, 'listed', 'emp-kestrel', 'Partnerships Manager', 'sports', 'loc-la', '2017-03', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a17', NULL, 'listed', 'emp-lakeview', 'Patient Experience Analyst', 'healthcare-life-sciences', 'loc-bos', '2021-08', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a18', NULL, 'hidden', 'emp-harbor-pine', 'Managing Director', 'financial-services', 'loc-nyc', '2010-07', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a19', NULL, 'listed', 'emp-silverline', 'Product Manager', 'technology', 'loc-sf', '2022-06', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a20', NULL, 'listed', 'emp-finch-rowe', 'Associate Attorney', 'legal', 'loc-dc', '2017-09', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a21', NULL, 'listed', 'emp-maplecrest', 'Vice President, Merchandising', 'consumer-retail', 'loc-chi', '2015-05', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a22', NULL, 'listed', 'emp-elm-street', 'Program Director', 'nonprofit-education', 'loc-syr', '2016-10', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a23', NULL, 'listed', NULL, NULL, NULL, NULL, NULL, NULL, 'Between roles; open to chats about retail startups.', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a24', NULL, 'listed', 'emp-silverline', 'Software Engineer II', 'technology', 'loc-sea', '2020-08', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a25', NULL, 'listed', 'emp-northgate', 'Communications Director', 'media-entertainment', 'loc-la', '2019-02', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a26', NULL, 'listed', 'emp-bluestone', 'Consultant', 'consulting', 'loc-chi', '2018-07', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a27', NULL, 'listed', 'emp-quarry', 'Principal', 'consulting', 'loc-nyc', '2015-06', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a28', NULL, 'listed', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a29', NULL, 'listed', 'emp-northgate', 'Producer', 'media-entertainment', 'loc-la', '2014-09', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-a30', NULL, 'listed', 'emp-ironwood', 'Plant Engineer', 'manufacturing-industrials', 'loc-phl', '2016-08', NULL, NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z');

-- Past jobs. p-a09's Bluestone role became a past job when they changed jobs (see history below).
INSERT INTO alumni_experiences(id, person_id, employer_id, title, industry_id, location_id, start_month, end_month, last_verified_at, created_at) VALUES
  ('exp-01', 'p-a09', 'emp-bluestone', 'Analyst', 'consulting', 'loc-nyc', '2017-07', '2024-02', '2023-11-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('exp-02', 'p-a23', 'emp-maplecrest', 'Buyer', 'consumer-retail', 'loc-chi', '2017-08', '2025-12', NULL, '2026-10-01T12:00:00.000Z'),
  ('exp-03', 'p-a01', 'emp-copperfield', 'Audit Associate', 'accounting', 'loc-nyc', '2015-09', '2019-05', NULL, '2026-10-01T12:00:00.000Z');

-- Contact details. Visibility is 'hidden' unless the alumnus consented (consent_at set).
INSERT INTO alumni_contacts(id, person_id, kind, label, value, value_key, visibility, consent_at, created_at, updated_at) VALUES
  ('c-01', 'p-a01', 'email', NULL, 'jordan.avery15@example.com', 'jordan.avery15@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-02', 'p-a01', 'linkedin', NULL, 'https://www.linkedin.com/in/example-jordan-avery-15', 'linkedin.com/in/example-jordan-avery-15', 'members', '2026-09-15T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-03', 'p-a02', 'email', NULL, 'j.avery18@example.com', 'j.avery18@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-04', 'p-a03', 'email', NULL, 'taylor.morgan@example.com', 'taylor.morgan@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-05', 'p-a04', 'email', NULL, 'tj.morgan@example.com', 'tj.morgan@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-06', 'p-a05', 'email', NULL, 'chris.oneil@example.com', 'chris.oneil@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-07', 'p-a06', 'email', NULL, 'c.oneil.2016@example.com', 'c.oneil.2016@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-08', 'p-a07', 'linkedin', NULL, 'https://www.linkedin.com/in/example-sam-rivera-lopez', 'linkedin.com/in/example-sam-rivera-lopez', 'members', '2026-08-20T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-09', 'p-a08', 'email', NULL, 'renee.dubois@example.com', 'renee.dubois@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-10', 'p-a09', 'email', NULL, 'marcus.b@example.com', 'marcus.b@example.com', 'members', '2026-09-20T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-11', 'p-a09', 'phone', NULL, '+1 315-555-0142', '+13155550142', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-12', 'p-a10', 'email', NULL, 'priya.n@example.com', 'priya.n@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-13', 'p-a12', 'linkedin', NULL, 'https://www.linkedin.com/in/example-meilin-zhao', 'linkedin.com/in/example-meilin-zhao', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-14', 'p-a18', 'email', NULL, 'theo.marchetti@example.com', 'theo.marchetti@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-15', 'p-a22', 'other', 'Personal website', 'https://example.com/isaac-thornbury', 'https://example.com/isaac-thornbury', 'members', '2026-09-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-16', 'p-a26', 'email', NULL, 'victor.osei@example.com', 'victor.osei@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-17', 'p-a27', 'email', NULL, 'pat.kim@example.com', 'pat.kim@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('c-18', 'p-a28', 'email', NULL, 'pat.kim@example.com', 'pat.kim@example.com', 'hidden', NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z');

INSERT INTO alumni_help_offered(person_id, help_kind_id) VALUES
  ('p-a01', 'career-advice'), ('p-a01', 'interview-prep'),
  ('p-a02', 'resume-review'),
  ('p-a05', 'case-interview-practice'), ('p-a05', 'introductions'),
  ('p-a07', 'industry-insight'),
  ('p-a09', 'case-interview-practice'), ('p-a09', 'career-advice'), ('p-a09', 'resume-review'),
  ('p-a10', 'industry-insight'),
  ('p-a12', 'resume-review'),
  ('p-a13', 'industry-insight'),
  ('p-a16', 'introductions'),
  ('p-a19', 'interview-prep'),
  ('p-a20', 'career-advice'),
  ('p-a22', 'career-advice'),
  ('p-a26', 'case-interview-practice'),
  ('p-a27', 'introductions');

-- Students. Every student profile links to a (fictional) Slice member account.
INSERT INTO alumni_student_profiles(person_id, member_id, note, last_verified_at, created_at, updated_at) VALUES
  ('p-s01', 'member-example-01', 'Preparing for consulting recruiting this spring.', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s02', 'member-example-02', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s03', 'member-example-03', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s04', 'member-example-04', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s05', 'member-example-05', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s06', 'member-example-06', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s07', 'member-example-07', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s08', 'member-example-08', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s09', 'member-example-09', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z'),
  ('p-s10', 'member-example-10', NULL, NULL, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z');

INSERT INTO alumni_student_industries(person_id, industry_id) VALUES
  ('p-s01', 'financial-services'), ('p-s01', 'consulting'),
  ('p-s02', 'media-entertainment'), ('p-s02', 'marketing-advertising'),
  ('p-s03', 'technology'),
  ('p-s04', 'accounting'), ('p-s04', 'financial-services'),
  ('p-s05', 'consulting'), ('p-s05', 'technology'),
  ('p-s06', 'government-public-policy'), ('p-s06', 'nonprofit-education'),
  ('p-s07', 'sports'),
  ('p-s08', 'real-estate'), ('p-s08', 'financial-services'),
  ('p-s09', 'energy-utilities'), ('p-s09', 'manufacturing-industrials'),
  ('p-s10', 'healthcare-life-sciences');

INSERT INTO alumni_student_cities(person_id, location_id) VALUES
  ('p-s01', 'loc-nyc'), ('p-s01', 'loc-bos'),
  ('p-s02', 'loc-nyc'), ('p-s02', 'loc-la'),
  ('p-s03', 'loc-sf'), ('p-s03', 'loc-sea'),
  ('p-s04', 'loc-nyc'), ('p-s04', 'loc-chi'),
  ('p-s05', 'loc-bos'), ('p-s05', 'loc-nyc'),
  ('p-s06', 'loc-dc'),
  ('p-s07', 'loc-la'), ('p-s07', 'loc-chi'),
  ('p-s08', 'loc-clt'), ('p-s08', 'loc-nyc'),
  ('p-s09', 'loc-phl'),
  ('p-s10', 'loc-bos');

INSERT INTO alumni_help_sought(person_id, help_kind_id) VALUES
  ('p-s01', 'interview-prep'), ('p-s01', 'case-interview-practice'),
  ('p-s02', 'resume-review'), ('p-s02', 'introductions'),
  ('p-s03', 'career-advice'), ('p-s03', 'interview-prep'),
  ('p-s04', 'resume-review'),
  ('p-s05', 'case-interview-practice'), ('p-s05', 'industry-insight'),
  ('p-s06', 'career-advice'), ('p-s06', 'introductions'),
  ('p-s07', 'industry-insight'),
  ('p-s08', 'career-advice'),
  ('p-s09', 'interview-prep'),
  ('p-s10', 'resume-review'), ('p-s10', 'career-advice');

-- Chris O'Neil and Christopher ONeil look alike (alias match, same year) but have different
-- emails, so they wait for an admin. Patrick Kim was merged into Pat Kim (same email).
INSERT INTO alumni_merge_candidates(id, person_id, other_person_id, incoming_record, reason, status, found_at, reviewed_by, reviewed_at) VALUES
  ('mc-01', 'p-a05', 'p-a06', NULL, 'Name matches an alias and the graduation year is the same, but the emails differ.', 'pending', '2026-10-01T12:00:00.000Z', NULL, NULL),
  ('mc-02', 'p-a27', 'p-a28', NULL, 'Name matches an alias, same graduation year and same email.', 'merged', '2026-10-01T12:00:00.000Z', 'member-example-admin', '2026-10-02T09:00:00.000Z');

-- Refresh proposals: one pending, one approved (applied, see history), one rejected.
INSERT INTO alumni_pending_changes(id, entity, record_id, field, current_value, proposed_value, source, found_at, status, reviewed_by, reviewed_at) VALUES
  ('pc-01', 'alumni_profile', 'p-a26', 'job_title', 'Consultant', 'Senior Consultant', 'https://example.com/news/bluestone-promotions', '2026-10-05T08:00:00.000Z', 'pending', NULL, NULL),
  ('pc-02', 'alumni_profile', 'p-a11', 'job_title', 'Operations Manager', 'Operations Director', 'https://example.com/ironwood/leadership', '2026-09-01T08:00:00.000Z', 'approved', 'member-example-admin', '2026-09-05T12:00:00.000Z'),
  ('pc-03', 'alumni_profile', 'p-a16', 'job_title', 'Partnerships Manager', 'Head of Partnerships', 'https://example.com/kestrel/about', '2026-09-10T08:00:00.000Z', 'rejected', 'member-example-admin', '2026-09-12T12:00:00.000Z');

INSERT INTO alumni_change_history(id, entity, record_id, field, old_value, new_value, actor_type, actor_member_id, pending_change_id, changed_at) VALUES
  ('h-01', 'alumni_profile', 'p-a09', 'current_job',
    '{"employerId":"emp-bluestone","title":"Analyst","industryId":"consulting","locationId":"loc-nyc","startMonth":"2017-07"}',
    '{"employerId":"emp-quarry","title":"Senior Consultant","industryId":"consulting","locationId":"loc-bos","startMonth":"2024-03"}',
    'alumnus', 'member-example-21', NULL, '2024-03-04T12:00:00.000Z'),
  ('h-02', 'alumni_profile', 'p-a11', 'job_title', 'Operations Manager', 'Operations Director', 'runner', NULL, 'pc-02', '2026-09-05T12:00:00.000Z'),
  ('h-03', 'person', 'p-a28', 'merged_into', NULL, 'p-a27', 'admin', 'member-example-admin', NULL, '2026-10-02T09:00:00.000Z');
