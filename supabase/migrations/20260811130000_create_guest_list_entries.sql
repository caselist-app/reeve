-- Brief 52 step 2, migration one of two: the guest list itself.
--
-- Every show needs a guest list and Reeve has nowhere to put one today. This is
-- the table the TM works the list in and the shape the chat request lands into.
-- All additive: a new table, so it is safe to apply before or after the code
-- ships and there is no -- deploy-order: line.
--
-- Two shapes here are deliberate and both were decided in the brief.
--
-- first_name and last_name are two columns and both are nullable. Two columns
-- because the duplicate check matches on the surname alone and a promoter export
-- needs it split. Nullable only because a chat request builds up over several
-- messages: guest_list_entries_named_unless_draft means the moment a row leaves
-- 'draft' it must carry both.
--
-- guest_type (who the guest is) and pass_type (what they get) are separate
-- columns and must not be conflated. guest_type is nullable with no default,
-- because a chat request never asks it and inventing a value would be a fact
-- nobody stated. pass_type is not null default 'ticket', because only the band
-- are asked which pass they want and everyone else's request is a ticket: that
-- is the stated semantics of an unanswered question. This is a SQL default on a
-- column every write path sets deliberately, not a forbidden Zod .default().
--
-- draft is a status, and it is how a multi-message chat request is held: a real
-- row in a real Postgres, so every transition is assertable, rather than a Redis
-- value the integration harness stubs to null. A draft is invisible to the TM,
-- excluded from every count, and never notifies. The partial unique index means
-- a second /guest for the same show from the same person resumes the same draft
-- rather than accumulating litter.
--
-- The three vocabularies below (guest_type, pass_type, pickup) are mirrored in
-- lib/guest-list/vocabulary.ts, which every reader imports. The check
-- constraints here must agree with that file.

create table guest_list_entries (
  id                     uuid        primary key default gen_random_uuid(),
  tour_id                uuid        not null references tours(id) on delete cascade,
  show_id                uuid        not null references shows(id) on delete cascade,
  first_name             text,
  last_name              text,
  email                  text,
  guest_type             text        check (guest_type in (
    'family','friend','industry','media','promoter','support','other')),
  num_tickets            integer     not null default 1 check (num_tickets >= 1),
  pass_type              text        not null default 'ticket' check (pass_type in (
    'ticket','guest_laminate','aaa','photo_pass','aftershow','other')),
  pass_type_detail       text,
  pickup                 text        check (pickup in ('box_office','production_office','other')),
  pickup_detail          text,
  priority               boolean     not null default false,
  -- on delete set null rather than cascade: taking a crew member off the tour
  -- must not delete the record of who asked, because that is the question the
  -- promoter asks when fourteen names turn up for ten spots.
  requested_by_person_id uuid        references people(id) on delete set null,
  request_channel        text        not null check (request_channel in ('app','whatsapp','telegram')),
  status                 text        not null check (status in (
    'draft','requested','approved','declined','removed')),
  decline_reason         text,
  notified_at            timestamptz,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- A row leaves 'draft' only once it has both names to put on the door.
  constraint guest_list_entries_named_unless_draft
    check (status = 'draft' or (first_name is not null and last_name is not null)),
  -- pass_type_detail and pickup_detail hold the label exactly when the value is
  -- 'other'. Same shape as day_items_other_needs_title.
  constraint guest_list_entries_pass_type_other
    check (pass_type <> 'other' or pass_type_detail is not null),
  constraint guest_list_entries_pickup_other
    check (pickup is distinct from 'other' or pickup_detail is not null),
  -- A decline reason cannot exist on a row that is not declined.
  constraint guest_list_entries_decline_reason_needs_declined
    check (decline_reason is null or status = 'declined'),
  -- A row that arrived over a channel must record who asked; only the TM's own
  -- 'app' adds are allowed a null requester.
  constraint guest_list_entries_chat_request_has_requester
    check (request_channel = 'app' or requested_by_person_id is not null)
);

-- The panel reads a show's list grouped by status; the tour index is for the
-- account-wide reads.
create index guest_list_entries_show_idx on guest_list_entries (show_id, status);
create index guest_list_entries_tour_idx on guest_list_entries (tour_id);

-- One live draft per person per show. Partial, so two 'requested' rows for the
-- same person and show do not collide: a crew member can genuinely have two
-- names on one show once each has left draft.
create unique index guest_list_entries_one_draft_per_person_show
  on guest_list_entries (requested_by_person_id, show_id)
  where status = 'draft';

alter table guest_list_entries enable row level security;

create policy "owner can manage guest_list_entries"
  on guest_list_entries for all
  using  (owns_tour(tour_id))
  with check (owns_tour(tour_id));

grant all on guest_list_entries to authenticated;
grant all on guest_list_entries to service_role;

create trigger set_updated_at
  before update on guest_list_entries
  for each row execute function set_updated_at();
