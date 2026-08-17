-- Brief 29: Roster Scoped to Artist, step 1.
--
-- contact_artists is the many-to-many record of which artist(s) a contact has
-- worked for. A contact is not owned by one artist: the same FOH engineer can
-- be crew on Artist A's summer run and picked up for Artist B's fall tour, so
-- this is a join table, not an artist_id column on contacts.
--
-- No owns_artist() helper: artists itself uses an inline account_id = auth.uid()
-- policy (20260612020000_artists.sql), so this table follows the same inline
-- pattern rather than inventing a new helper function for one table.
--
-- No backfill. Existing contacts get zero contact_artists rows when this lands:
-- Matt assigns them by hand in the roster UI a later step of this brief ships,
-- not from an inferred match against tour history.

create table contact_artists (
  contact_id uuid not null references contacts(id) on delete cascade,
  artist_id  uuid not null references artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, artist_id)
);

create index on contact_artists(artist_id);
create index on contact_artists(contact_id);

alter table contact_artists enable row level security;

create policy "account manages own contact_artists" on contact_artists
  for all using (
    exists (select 1 from contacts c where c.id = contact_id and c.account_id = auth.uid())
  )
  with check (
    exists (select 1 from contacts c where c.id = contact_id and c.account_id = auth.uid())
    and exists (select 1 from artists a where a.id = artist_id and a.account_id = auth.uid())
  );

grant select, insert, update, delete on contact_artists to authenticated;
grant select, insert, update, delete on contact_artists to service_role;

-- add_contact_to_tour: auto-link the contact to the tour's artist on every
-- call, so the roster remembers this contact has worked that artist without a
-- separate "link to artist" step. on conflict do nothing, so re-adding a
-- contact to a second tour for an artist they are already linked to no-ops
-- rather than throwing.
create or replace function add_contact_to_tour(
  p_tour_id uuid,
  p_contact_id uuid,
  p_person_type text default null,
  p_role text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact contacts;
  v_person_id uuid;
  v_type text;
  v_artist_id uuid;
begin
  if not owns_tour(p_tour_id) then
    raise exception 'not authorised for tour';
  end if;

  select * into v_contact from contacts
  where id = p_contact_id and account_id = auth.uid();
  if not found then
    raise exception 'contact not found';
  end if;

  v_type := coalesce(p_person_type, v_contact.default_person_type);

  insert into people (tour_id, contact_id, person_type, role)
  values (p_tour_id, p_contact_id, v_type, coalesce(p_role, v_contact.default_role))
  returning id into v_person_id;

  if v_type = 'crew' then
    insert into crew_detail (
      person_id, tour_id, per_diem_rate, per_diem_currency,
      daily_wage_rate, wage_currency
    ) values (
      v_person_id, p_tour_id,
      v_contact.default_per_diem_rate, v_contact.default_per_diem_currency,
      v_contact.default_daily_wage_rate, v_contact.default_wage_currency
    );
  end if;

  select artist_id into v_artist_id from tours where id = p_tour_id;

  insert into contact_artists (contact_id, artist_id)
  values (p_contact_id, v_artist_id)
  on conflict (contact_id, artist_id) do nothing;

  return v_person_id;
end;
$$;
