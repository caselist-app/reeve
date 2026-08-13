-- Brief 57: the map replaces the address.
--
-- Caches a show's weather so the day view reads it off the row instead of
-- calling the weather provider on every render. weather_code is the
-- provider's numeric condition code (e.g. WMO weather interpretation code),
-- not a text label, so the UI maps it to an icon/description at render time
-- and a provider swap only changes the mapping, not the stored value.
-- Written and refreshed by the venue-weather resolver added later in this
-- chain. No new table, so no new RLS policy or grants: shows already has
-- RLS enabled and owner policies from its original migration
-- (20260609120002_shows.sql).

alter table shows
  add column weather_temp_c numeric,
  add column weather_code integer,
  add column weather_fetched_at timestamptz;
