-- Alumni app: industry labels used in Slice's alumni contact book.
--
-- The contact book describes some jobs by the kind of work rather than the employer's industry,
-- and uses "Other" where nothing fits. These four labels are added to the fixed list so every
-- row of the book can be loaded as it is kept. Its shorter labels for existing industries
-- (Finance, Marketing, Government) are matched by the loader and need no new entry.

INSERT INTO alumni_industries(id, name) VALUES
  ('communications', 'Communications'),
  ('recruiting-hr', 'Recruiting and HR'),
  ('sales', 'Sales'),
  ('other', 'Other');
