-- Alumni app: correcting a current job.
--
-- An admin can fix a mistake in an alum's current job, such as a company and role entered in
-- each other's columns or the wrong industry. The alum did not change jobs, so the job is not
-- moved to past jobs and the dates on it stay as they were. The correction is logged in the
-- change history as its own kind of entry, so it is not mistaken for a new job.
INSERT INTO alumni_change_fields(entity, field, description) VALUES
  ('alumni_profile', 'job_corrected', 'A correction to the current job''s company, title or industry, as JSON in the same shape as current_job. The alum did not move, so nothing goes to past jobs.');
