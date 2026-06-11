-- Brief 20 follow-up: restore per-tour WhatsApp uniqueness.
--
-- Before the roster, people.whatsapp_number carried a unique index on
-- (tour_id, whatsapp_number): two people on one tour could not share a number,
-- which is what makes inbound WhatsApp resolution unambiguous (a number maps to
-- exactly one person on the tour). The number now lives on contacts, so that
-- guard is gone. These triggers reinstate it across the people -> contacts join.
--
-- They raise SQLSTATE 23505 (unique_violation) so the application can catch the
-- same code it already handles and show a friendly "already in use" message.

-- Fired when a person is added to a tour, or re-pointed at a different contact.
-- Checks the linked contact's WhatsApp number does not already belong to another
-- person on the same tour.
create or replace function enforce_person_whatsapp_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
  v_conflict uuid;
begin
  select whatsapp_number into v_number from contacts where id = new.contact_id;
  if v_number is null then
    return new;
  end if;

  select p.id into v_conflict
  from people p
  join contacts c on c.id = p.contact_id
  where p.tour_id = new.tour_id
    and p.id <> new.id
    and c.whatsapp_number = v_number
  limit 1;

  if v_conflict is not null then
    raise exception 'whatsapp number % already in use on this tour', v_number
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_person_whatsapp_unique on people;
create trigger enforce_person_whatsapp_unique
  before insert or update of contact_id, tour_id on people
  for each row execute function enforce_person_whatsapp_unique();

-- Fired when a contact's WhatsApp number changes. For every tour the contact is
-- on, checks no other person on that tour already holds the new number.
create or replace function enforce_contact_whatsapp_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict uuid;
begin
  if new.whatsapp_number is null then
    return new;
  end if;

  select p2.id into v_conflict
  from people p1
  join people p2 on p2.tour_id = p1.tour_id and p2.contact_id <> new.id
  join contacts c2 on c2.id = p2.contact_id
  where p1.contact_id = new.id
    and c2.whatsapp_number = new.whatsapp_number
  limit 1;

  if v_conflict is not null then
    raise exception 'whatsapp number % already in use on a shared tour', new.whatsapp_number
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_contact_whatsapp_unique on contacts;
create trigger enforce_contact_whatsapp_unique
  before update of whatsapp_number on contacts
  for each row
  when (new.whatsapp_number is distinct from old.whatsapp_number)
  execute function enforce_contact_whatsapp_unique();
