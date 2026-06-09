-- venue_lat and venue_lng cache the Google Maps geocode result on the show row.
-- Re-geocode only when shows.address changes (same pattern as hub resolution).
alter table shows
  add column if not exists venue_lat double precision,
  add column if not exists venue_lng double precision;

-- status tracks whether the TM has booked the hotel or just recorded a candidate.
-- Defaults to 'planned'. The TM sets 'booked' after booking off-platform and
-- entering the confirmation number. Nothing in the codebase may auto-set 'booked'.
alter table hotel_stays
  add column if not exists status text not null default 'planned'
    check (status in ('planned', 'booked'));
