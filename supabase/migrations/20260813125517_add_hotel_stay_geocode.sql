-- lat and lng cache the Google Maps geocode result on the hotel stay row, the
-- same static-map cache shows.venue_lat/venue_lng already feeds (REE-178).
-- Re-geocode only when hotel_stays.address changes (same pattern as venue hub
-- resolution). REE-206.
alter table hotel_stays
  add column if not exists lat double precision,
  add column if not exists lng double precision;
