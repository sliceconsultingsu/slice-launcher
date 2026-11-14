-- Alumni app: starting reference lists (schools, majors, industries, kinds of help).
--
-- These are public facts and Slice's own choices, not personal data. Admins can add entries or
-- retire them later (active = 0) without deleting history.
--
-- Schools and majors were checked on 2026-11-13 against Syracuse University's official 2026-27
-- undergraduate catalog (https://coursecatalog.syracuse.edu/academic-offerings/). Every name below
-- appears there under the school shown, with these deliberate choices:
--   JOINT = offered by both Arts and Sciences and the Maxwell School. Each major may name only one
--   school, so these are assigned to Arts and Sciences (agreed for Economics and Political Science;
--   applied the same way to the others). The Maxwell School therefore has no majors yet.
--   Older degree names (for example Magazine, News and Digital Journalism, or Graphic Design) are
--   not included; graduates who earned them need a decision on historical names.

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
  -- Arts and Sciences (JOINT with Maxwell)
  ('economics', 'Economics', 'arts-sciences'),
  ('political-science', 'Political Science', 'arts-sciences'),
  ('international-relations', 'International Relations', 'arts-sciences'),
  ('policy-studies', 'Policy Studies', 'arts-sciences'),
  ('history', 'History', 'arts-sciences'),
  ('sociology', 'Sociology', 'arts-sciences'),
  ('public-health', 'Public Health', 'arts-sciences'),
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
