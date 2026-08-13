-- Brief 35, REE-169. Records which party picker preset produced a segment's
-- or stay's transport_assignment / room_assignment rows. Provenance only:
-- never read to drive behaviour, only to show the TM how the party was
-- chosen. Default 'whole_party' covers every row written before this column
-- existed and every writer that has not been wired to the picker yet.
alter table transport_segments
  add column created_as text not null default 'whole_party'
    check (created_as in ('whole_party', 'artist', 'crew', 'named'));

alter table hotel_stays
  add column created_as text not null default 'whole_party'
    check (created_as in ('whole_party', 'artist', 'crew', 'named'));
