-- Catering fields on day_sheets.
-- catering_type is the top-level selector (none / buyout / provided).
-- The six timestamptz columns hold breakfast, lunch, and dinner windows.
-- Only populated when catering_type = 'provided'.
-- Timestamptz matches every other day_sheets time column for consistent
-- timezone handling. The block renderer formats them into local time at send.

alter table day_sheets add column catering_type text not null default 'none'
  check (catering_type in ('none', 'buyout', 'provided'));
alter table day_sheets add column catering_breakfast_start timestamptz;
alter table day_sheets add column catering_breakfast_end timestamptz;
alter table day_sheets add column catering_lunch_start timestamptz;
alter table day_sheets add column catering_lunch_end timestamptz;
alter table day_sheets add column catering_dinner_start timestamptz;
alter table day_sheets add column catering_dinner_end timestamptz;
