-- Alumni app: starting reference lists (schools, majors, industries, kinds of help).
--
-- These are public facts and Slice's own choices, not personal data. Admins can add entries or
-- retire them later (active = 0) without deleting history.
--
-- Schools and majors were checked on 2026-11-13 against Syracuse University's official 2026-27
-- undergraduate catalog (https://coursecatalog.syracuse.edu/academic-offerings/). Every name below
-- appears there, with these deliberate choices:
--   MAXWELL = the social science and policy majors the Maxwell School's catalog section names as its
--   undergraduate degrees (https://coursecatalog.syracuse.edu/undergraduate/citizenship-public-affairs/).
--   The catalog files their program pages under Arts and Sciences (Maxwell offers them "in
--   partnership with the College of Arts and Sciences"), but each major may name only one school,
--   so they are assigned to Maxwell. Human Development and Family Science is an Arts and Sciences
--   department and stays there.
--   FORMER NAMES: older degree names found in the catalog's archived 2024-25 and 2025-26
--   editions are added at the end as retired entries pointing at the current program. Only names
--   actually found there are included; admins can add more as real alumni data arrives.

INSERT INTO alumni_schools(id, name) VALUES
  ('whitman', 'Martin J. Whitman School of Management'),
  ('arts-sciences', 'College of Arts and Sciences'),
  ('newhouse', 'S.I. Newhouse School of Public Communications'),
  ('engineering', 'College of Engineering and Computer Science'),
  ('ischool', 'School of Information Studies'),
  ('maxwell', 'Maxwell School of Citizenship and Public Affairs'),
  ('falk', 'David B. Falk College of Sport'),
  ('vpa', 'College of Visual and Performing Arts'),
  ('architecture', 'School of Architecture'),
  ('education', 'School of Education');

INSERT INTO alumni_majors(id, name, school_id) VALUES
  -- Whitman
  ('accounting', 'Accounting', 'whitman'),
  ('business-analytics', 'Business Analytics', 'whitman'),
  ('entrepreneurship', 'Entrepreneurship and Emerging Enterprises', 'whitman'),
  ('finance', 'Finance', 'whitman'),
  ('management', 'Management', 'whitman'),
  ('marketing-management', 'Marketing Management', 'whitman'),
  ('real-estate', 'Real Estate', 'whitman'),
  ('retail-management', 'Retail Management', 'whitman'),
  ('supply-chain-management', 'Supply Chain Management', 'whitman'),
  -- Maxwell (the catalog files these program pages under Arts and Sciences; see the note above).
  -- Environment, Sustainability, and Policy is named in Maxwell's overview but not linked in its
  -- program list; its pages describe Maxwell students' requirements.
  ('anthropology', 'Anthropology', 'maxwell'),
  ('economics', 'Economics', 'maxwell'),
  ('environment-sustainability-policy', 'Environment, Sustainability, and Policy', 'maxwell'),
  ('geography', 'Geography', 'maxwell'),
  ('history', 'History', 'maxwell'),
  ('international-relations', 'International Relations', 'maxwell'),
  ('law-society-policy', 'Law, Society, and Policy', 'maxwell'),
  ('policy-studies', 'Policy Studies', 'maxwell'),
  ('political-science', 'Political Science', 'maxwell'),
  ('public-health', 'Public Health', 'maxwell'),
  ('sociology', 'Sociology', 'maxwell'),
  -- Arts and Sciences
  ('psychology', 'Psychology', 'arts-sciences'),
  ('mathematics', 'Mathematics', 'arts-sciences'),
  ('biology', 'Biology', 'arts-sciences'),
  ('english-textual-studies', 'English and Textual Studies', 'arts-sciences'),
  ('philosophy', 'Philosophy', 'arts-sciences'),
  ('chemistry', 'Chemistry', 'arts-sciences'),
  ('physics', 'Physics', 'arts-sciences'),
  ('neuroscience', 'Neuroscience', 'arts-sciences'),
  ('human-development-family-science', 'Human Development and Family Science', 'arts-sciences'),
  -- Newhouse
  ('advertising', 'Advertising', 'newhouse'),
  ('public-relations', 'Public Relations', 'newhouse'),
  ('journalism', 'Journalism', 'newhouse'),
  ('television-radio-film', 'Television, Radio and Film', 'newhouse'),
  ('visual-communications', 'Visual Communications', 'newhouse'),
  -- Engineering and Computer Science
  ('computer-science', 'Computer Science', 'engineering'),
  ('computer-engineering', 'Computer Engineering', 'engineering'),
  ('electrical-engineering', 'Electrical Engineering', 'engineering'),
  ('mechanical-engineering', 'Mechanical Engineering', 'engineering'),
  ('civil-engineering', 'Civil Engineering', 'engineering'),
  ('aerospace-engineering', 'Aerospace Engineering', 'engineering'),
  ('chemical-engineering', 'Chemical Engineering', 'engineering'),
  ('biomedical-engineering', 'Biomedical Engineering', 'engineering'),
  -- Information Studies
  ('information-management-technology', 'Information Management and Technology', 'ischool'),
  ('applied-data-science', 'Applied Data Science', 'ischool'),
  -- Falk
  ('sport-management', 'Sport Management', 'falk'),
  ('sport-analytics', 'Sport Analytics', 'falk'),
  ('nutrition', 'Nutrition', 'falk'),
  -- Visual and Performing Arts
  ('industrial-interaction-design', 'Industrial and Interaction Design', 'vpa'),
  ('communications-design', 'Communications Design', 'vpa'),
  ('music-industry', 'Music Industry', 'vpa'),
  ('film', 'Film', 'vpa'),
  -- Architecture and Education
  ('architecture', 'Architecture', 'architecture'),
  ('inclusive-childhood-education', 'Inclusive Childhood Education', 'education');

-- Former degree names (retired, no school of their own). Each was found as an undergraduate
-- program in an archived edition of the official catalog, https://coursecatalog.syracuse.edu/archive/
INSERT INTO alumni_majors(id, name, school_id, current_major_id, active) VALUES
  -- Same catalog page address, renamed from the 2024-25 to the 2025-26 edition:
  -- /archive/2024-2025/undergraduate/information-studies/applied-data-analytics-bs/
  ('applied-data-analytics', 'Applied Data Analytics', NULL, 'applied-data-science', 0),
  -- Both listed 'Not admitting after Fall 2024' while Journalism, BS was 'Not admitting until
  -- Fall 2025' in the same edition. The catalog does not state the replacement in words.
  -- /archive/2024-2025/undergraduate/public-communications/magazine-news-digital-journalism-bs/
  ('magazine-news-digital-journalism', 'Magazine, News and Digital Journalism', NULL, 'journalism', 0),
  -- /archive/2024-2025/undergraduate/public-communications/broadcast-digital-journalism-bs/
  ('broadcast-digital-journalism', 'Broadcast and Digital Journalism', NULL, 'journalism', 0),
  -- Listed 'Not admitting students' in 2024-25 and 2025-26. NOT VERIFIED: the catalog does not
  -- name a successor; linked to Visual Communications (whose Design track is the closest match).
  -- /archive/2025-2026/undergraduate/public-communications/graphic-design-bs/
  ('graphic-design', 'Graphic Design', NULL, 'visual-communications', 0);

INSERT INTO alumni_industries(id, name) VALUES
  ('consulting', 'Consulting'),
  ('financial-services', 'Financial Services'),
  ('accounting', 'Accounting'),
  ('technology', 'Technology'),
  ('media-entertainment', 'Media and Entertainment'),
  ('marketing-advertising', 'Marketing and Advertising'),
  ('healthcare-life-sciences', 'Healthcare and Life Sciences'),
  ('consumer-retail', 'Consumer Products and Retail'),
  ('real-estate', 'Real Estate'),
  ('government-public-policy', 'Government and Public Policy'),
  ('nonprofit-education', 'Nonprofit and Education'),
  ('energy-utilities', 'Energy and Utilities'),
  ('manufacturing-industrials', 'Manufacturing and Industrials'),
  ('sports', 'Sports'),
  ('legal', 'Legal');

INSERT INTO alumni_help_kinds(id, name) VALUES
  ('career-advice', 'Career advice'),
  ('industry-insight', 'Industry insight'),
  ('resume-review', 'Resume review'),
  ('interview-prep', 'Interview prep'),
  ('case-interview-practice', 'Case interview practice'),
  ('introductions', 'Introductions');
