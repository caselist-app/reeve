-- Brief 20: Crew Roster.
--
-- Introduces account-level `contacts` as the single source of truth for a
-- person's identity (passport, dietary, allergies, channels, emergency contact).
-- A `people` row becomes a tour membership: it links a contact to a tour and
-- holds only what is true for that tour (person_type, role). Identity is read
-- live from the contact, so updating a passport once is correct on every tour.
--
-- Historical documents are not affected: a sent boarding pass, day sheet, or
-- settlement is a stored artifact that captured its values when generated; it
-- does not read the live record.

-- 1. contacts: identity, account-scoped ---------------------------------------
-- Scopes by account_id = auth.uid() directly (the same inline pattern `tours`
-- uses), because it sits above tours and cannot use owns_tour, which reads tours.
create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  photo_url text,
  contact_email text,
  contact_phone text,
  -- Matches the current people.preferred_channel domain (SMS retired in
  -- 20260611230000_notifications_service.sql; email is a real channel).
  preferred_channel text not null default 'whatsapp'
    check (preferred_channel in ('whatsapp', 'email', 'both')),
  whatsapp_number text,
  sms_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  dietary text,
  allergies text,
  home_city text,
  passport_number text,
  passport_expiry date,
  passport_country text,
  tshirt_size text,
  -- default_* values pre-fill the per-tour terms when a contact is added to a
  -- tour. They are not the live tour value; the tour value lives on people /
  -- crew_detail and is edited there.
  default_person_type text not null default 'crew'
    check (default_person_type in ('artist', 'crew', 'management', 'support')),
  default_role text,
  default_per_diem_rate numeric(10, 2),
  default_per_diem_currency text,
  default_daily_wage_rate numeric(10, 2),
  default_wage_currency text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on contacts(account_id);
create index on contacts(account_id, name);
-- Lookup index for inbound WhatsApp resolution. NOT unique on purpose: the
-- backfill below creates one contact per historical person, so the same number
-- can legitimately appear on several contacts until the TM merges them. Per-tour
-- uniqueness is guaranteed on people instead (unique(tour_id, contact_id)).
create index on contacts(account_id, whatsapp_number) where whatsapp_number is not null;

alter table contacts enable row level security;

create policy "account reads own contacts" on contacts
  for select using (account_id = auth.uid());

create policy "account writes own contacts" on contacts
  for all using (account_id = auth.uid())
  with check (account_id = auth.uid());

create trigger set_updated_at before update on contacts
  for each row execute function set_updated_at();

-- 2. people gains contact_id (nullable first so the backfill can populate it) --
-- on delete restrict: a contact in use on a tour cannot be deleted. The app
-- removes them from tours first, or the roster delete is blocked with a message.
alter table people add column contact_id uuid references contacts(id) on delete restrict;

-- 3. Backfill: lift each existing person's identity into a new contact under
-- that tour's account, then link the person to it. Rates seed the contact's
-- defaults. One contact per person: we cannot know that the same human on two
-- tours is the same person, so we never merge automatically.
do $$
declare
  r record;
  v_contact_id uuid;
begin
  for r in
    select p.*, t.account_id as acct,
           cd.per_diem_rate, cd.per_diem_currency,
           cd.daily_wage_rate, cd.wage_currency
    from people p
    join tours t on t.id = p.tour_id
    left join crew_detail cd on cd.person_id = p.id
  loop
    insert into contacts (
      account_id, name, photo_url, contact_email, contact_phone,
      preferred_channel, whatsapp_number, sms_number,
      emergency_contact_name, emergency_contact_phone,
      dietary, allergies, home_city,
      passport_number, passport_expiry, passport_country, tshirt_size,
      default_person_type, default_role,
      default_per_diem_rate, default_per_diem_currency,
      default_daily_wage_rate, default_wage_currency
    ) values (
      r.acct, r.name, r.photo_url, r.contact_email, r.contact_phone,
      r.preferred_channel, r.whatsapp_number, r.sms_number,
      r.emergency_contact_name, r.emergency_contact_phone,
      r.dietary, r.allergies, r.home_city,
      r.passport_number, r.passport_expiry, r.passport_country, r.tshirt_size,
      r.person_type, r.role,
      r.per_diem_rate, r.per_diem_currency,
      r.daily_wage_rate, r.wage_currency
    )
    returning id into v_contact_id;

    update people set contact_id = v_contact_id where id = r.id;
  end loop;
end $$;

-- 4. Enforce the link and per-tour uniqueness ---------------------------------
alter table people alter column contact_id set not null;
create unique index on people(tour_id, contact_id);
create index on people(contact_id);

-- 5. Drop the identity columns now sourced from the contact. This also drops the
-- old unique index people(tour_id, whatsapp_number); inbound resolution now joins
-- people -> contacts on the message's tour.
alter table people
  drop column name,
  drop column photo_url,
  drop column contact_email,
  drop column contact_phone,
  drop column preferred_channel,
  drop column whatsapp_number,
  drop column sms_number,
  drop column emergency_contact_name,
  drop column emergency_contact_phone,
  drop column dietary,
  drop column allergies,
  drop column home_city,
  drop column passport_number,
  drop column passport_expiry,
  drop column passport_country,
  drop column tshirt_size;

-- 6. add_contact_to_tour: create a tour membership from a roster contact.
-- Does not copy identity (identity stays on the contact); only sets the per-tour
-- terms, seeded from the contact's defaults. security definer: it checks
-- ownership of both the tour and the contact itself.
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

  return v_person_id;
end;
$$;

-- 7. Grants. Default privileges (20260610120000) already cover new objects, but
-- Reeve migrations grant explicitly so intent is visible in the migration.
grant select, insert, update, delete on contacts to anon, authenticated, service_role;
grant execute on function add_contact_to_tour(uuid, uuid, text, text) to authenticated, service_role;
