-- Alumni app: confirmation emails.
--
-- An admin can have the app email each listed alum to ask whether their details are still right
-- and which contact details they are happy to share. The alum answers by replying to that email,
-- which reaches the admin who sent it; the admin then records the reply. This table logs each
-- email so nobody is asked twice by accident. It holds no message text and no email address.

CREATE TABLE alumni_confirmation_requests (
  -- One confirmation email sent, or attempted, to one alum. Admins only.
  id TEXT PRIMARY KEY, -- Random ID.
  person_id TEXT NOT NULL REFERENCES alumni_profiles(person_id), -- The alum who was asked.
  contact_id TEXT NOT NULL, -- The email contact detail it went to (an alumni_contacts ID). The address itself is not copied here.
  requested_at TEXT NOT NULL, -- When the send was attempted.
  requested_by TEXT NOT NULL, -- Member ID of the admin who sent it. Replies go to that admin's own email.
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'failed')), -- sent: accepted by the mail service; failed: it refused this recipient.
  detail TEXT CHECK (detail IS NULL OR length(trim(detail)) BETWEEN 1 AND 200), -- For a failure, the mail service's short error code. Never message text.
  message_id TEXT, -- The mail service's ID for an accepted message; NULL otherwise.
  answered_at TEXT, -- When an admin recorded the alum's reply; NULL until then.
  answered_by TEXT, -- Member ID of the admin who recorded the reply; NULL until then.
  CHECK ((answered_at IS NULL) = (answered_by IS NULL))
);
CREATE INDEX alumni_confirmation_requests_person ON alumni_confirmation_requests(person_id, requested_at);

-- Two more kinds of change an admin can make when recording a reply, so they appear in history.
INSERT INTO alumni_change_fields(entity, field, description) VALUES
  ('alumni_profile', 'help_offered', 'Kinds of help the alum offers, as a JSON list of IDs.'),
  ('alumni_profile', 'confirmed', 'The alum confirmed their details by replying to a confirmation email. The new value is when the reply was recorded.');
