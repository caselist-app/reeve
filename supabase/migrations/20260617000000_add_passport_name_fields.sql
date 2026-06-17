-- Add passport name fields to contacts.
-- These are the names exactly as printed on the passport and are used for
-- travel and visa documents. The display name (contacts.name) is unchanged.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS passport_first_names text,
  ADD COLUMN IF NOT EXISTS passport_surname text;

GRANT ALL ON TABLE contacts TO authenticated;
GRANT ALL ON TABLE contacts TO service_role;
