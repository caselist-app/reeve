-- artists: one row per artist/act per account.
-- Sits between accounts and tours so multiple tours can belong to the same artist
-- without duplicating the name, slug, or email domain.
create table artists (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  slug        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Slug must be unique per account (only when set).
create unique index artists_account_slug_unique on artists(account_id, slug) where slug is not null;

create trigger set_updated_at before update on artists
  for each row execute function set_updated_at();

alter table artists enable row level security;

create policy "artists: owner full access" on artists
  for all using (account_id = auth.uid());

-- Migrate existing tour data: create one artist per unique (account_id, artist_act).
-- Take the slug from the oldest tour for that artist_act.
insert into artists (account_id, name, slug)
select distinct on (account_id, artist_act)
  account_id,
  artist_act as name,
  artist_slug as slug
from tours
where artist_act is not null
order by account_id, artist_act, created_at asc;

-- Add artist_id to tours (nullable initially so migration can populate it).
alter table tours add column artist_id uuid references artists(id) on delete restrict;

-- Populate artist_id from migrated data.
update tours t
set artist_id = a.id
from artists a
where a.account_id = t.account_id and a.name = t.artist_act;

-- Now enforce not null.
alter table tours alter column artist_id set not null;

-- Remove old columns.
alter table tours drop column artist_act;
alter table tours drop column artist_slug;

-- Explicit grants required on every migration.
grant select, insert, update, delete on artists to authenticated;
grant select, insert, update, delete on artists to service_role;
