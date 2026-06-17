-- Optional per-day title override for the schedule day header.
-- When set, the header shows this instead of the derived per-type title.
-- Null means fall back to the default (venue, "Travel to ...", etc).

alter table tour_dates
  add column if not exists custom_title text;

-- tour_dates is already granted, but new migrations re-grant explicitly so they
-- never rely on the catch-all default-privileges migration.
grant select, insert, update, delete on tour_dates to authenticated;
grant select, insert, update, delete on tour_dates to service_role;
