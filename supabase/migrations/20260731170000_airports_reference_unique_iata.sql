-- Brief 31 follow-up: AirLabs' airport dump has more than one row for some
-- IATA codes (verified live: MXQ, and ACF found when this migration first
-- ran against already-seeded data). The seed job now dedupes on the
-- application side (first occurrence wins), but the table was seeded
-- before that fix existed, so it still holds the original duplicates on
-- disk. Clean those up before adding the constraint, keeping the
-- lowest-id row per code (arbitrary but stable) - the row about to be
-- kept will be replaced by a correct one the next time the seed job runs
-- anyway.
delete from airports_reference a
  using airports_reference b
  where a.iata_code = b.iata_code
    and a.id > b.id;

-- Enforcing uniqueness at the DB level so the guarantee doesn't rely
-- solely on the seed job's own dedupe logic - a future insert path that
-- skips that step should fail loudly rather than silently reintroducing
-- duplicate-key React warnings in the "Find by route" airport picker.
alter table airports_reference
  add constraint airports_reference_iata_code_key unique (iata_code);
