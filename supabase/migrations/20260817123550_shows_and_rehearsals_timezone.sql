-- REE-241: timezone follows the venue, not the tour (Brief 56).
--
-- Today a show and a rehearsal both fall back to tours.timezone, so a tour
-- that crosses zones (e.g. a European leg followed by a US leg) renders every
-- day's times in one zone regardless of where the venue actually is. This
-- adds a per-row timezone so each show and rehearsal can store its own
-- resolved IANA zone (e.g. Europe/London, America/New_York), same text shape
-- as tours.timezone (20260609120009_tours_timezone_show_rpc.sql).
--
-- rehearsals also gets venue_lat/venue_lng, the same double precision shape
-- as shows.venue_lat/venue_lng (20260609120010_shows_geocode_hotel_status.sql),
-- since resolving a rehearsal's timezone from its address needs the same
-- geocode cache shows already have.
--
-- Additive only: nothing renamed or dropped, so this is safe to apply any
-- time and needs no deploy-order line. Two follow-up tickets read these
-- columns back; this migration adds nothing that writes them yet.

alter table shows
  add column if not exists timezone text;

alter table rehearsals
  add column if not exists venue_lat double precision,
  add column if not exists venue_lng double precision,
  add column if not exists timezone text;
