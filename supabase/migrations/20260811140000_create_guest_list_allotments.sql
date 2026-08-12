-- Brief 52 step 2, migration two of two: allotments, and the two shows columns.
--
-- All additive: a new table plus two `add column if not exists` on shows, so it
-- is safe to apply before or after the code ships and there is no
-- -- deploy-order: line.
--
-- One row per credential per show, not one cap column on the show. A promoter
-- gives you eight tickets and two AAA laminates, which is two separate numbers a
-- single guest_list_cap integer cannot say. A show with no allotment rows has no
-- limits and warns about nothing, which is the normal state of a show nobody has
-- advanced yet. pass_type mirrors the same six-value vocabulary as
-- guest_list_entries and lib/guest-list/vocabulary.ts.

create table guest_list_allotments (
  id          uuid        primary key default gen_random_uuid(),
  tour_id     uuid        not null references tours(id) on delete cascade,
  show_id     uuid        not null references shows(id) on delete cascade,
  pass_type   text        not null check (pass_type in (
    'ticket','guest_laminate','aaa','photo_pass','aftershow','other')),
  num_allowed integer     not null check (num_allowed >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One allotment per pass type per show. A second row for the same show and pass
-- type is the promoter number stated twice, so it collides rather than doubling
-- the cap.
create unique index guest_list_allotments_show_pass_idx
  on guest_list_allotments (show_id, pass_type);

alter table guest_list_allotments enable row level security;

create policy "owner can manage guest_list_allotments"
  on guest_list_allotments for all
  using  (owns_tour(tour_id))
  with check (owns_tour(tour_id));

grant all on guest_list_allotments to authenticated;
grant all on guest_list_allotments to service_role;

create trigger set_updated_at
  before update on guest_list_allotments
  for each row execute function set_updated_at();

-- The two shows columns, both additive.
--
-- guest_list_cutoff_at is null until the TM sets one, per show. No default and
-- no tour-level inheritance: a default that silently closes a list is worse than
-- no cutoff, because the first the TM learns of it is a crew member saying Reeve
-- refused them.
--
-- guest_list_locked is the manual lock, independent of the cutoff. Either one
-- closes the list to crew. Neither ever blocks the TM.
alter table shows
  add column if not exists guest_list_cutoff_at timestamptz,
  add column if not exists guest_list_locked    boolean not null default false;
