-- Brief 24: Telegram identity on contacts.
--
-- WhatsApp identity is a phone number, known the moment a contact is created.
-- Telegram identity is a chat_id, which does not exist until the person has
-- actually messaged the bot (see the linking flow in a later migration). This
-- adds the columns that hold that identity once linked.
--
-- bigint because Telegram chat ids can exceed the 32-bit range.

alter table contacts add column telegram_chat_id bigint;
alter table contacts add column telegram_username text;

-- Lookup index for inbound Telegram resolution. NOT unique, mirrors the
-- existing whatsapp_number index exactly: the same physical person could
-- legitimately be a contact under two different Reeve accounts (two different
-- TMs who both use Reeve). Per-tour uniqueness is enforced below instead.
create index on contacts(account_id, telegram_chat_id) where telegram_chat_id is not null;

-- The two triggers below mirror enforce_person_whatsapp_unique and
-- enforce_contact_whatsapp_unique from 20260612010000_tour_whatsapp_unique.sql,
-- same shape, swapped column. See that migration for the full reasoning: the
-- number (here, chat id) lives on contacts, so this reinstates per-tour
-- uniqueness across the people -> contacts join, raising SQLSTATE 23505
-- (unique_violation) so the application can catch the same code it already
-- handles for WhatsApp and show a friendly "already in use" message.

-- Fired when a person is added to a tour, or re-pointed at a different contact.
-- Checks the linked contact's Telegram chat id does not already belong to
-- another person on the same tour.
create or replace function enforce_person_telegram_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat_id bigint;
  v_conflict uuid;
begin
  select telegram_chat_id into v_chat_id from contacts where id = new.contact_id;
  if v_chat_id is null then
    return new;
  end if;

  select p.id into v_conflict
  from people p
  join contacts c on c.id = p.contact_id
  where p.tour_id = new.tour_id
    and p.id <> new.id
    and c.telegram_chat_id = v_chat_id
  limit 1;

  if v_conflict is not null then
    raise exception 'telegram account already in use on this tour'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_person_telegram_unique on people;
create trigger enforce_person_telegram_unique
  before insert or update of contact_id, tour_id on people
  for each row execute function enforce_person_telegram_unique();

-- Fired when a contact's Telegram chat id changes. For every tour the contact
-- is on, checks no other person on that tour already holds the new chat id.
create or replace function enforce_contact_telegram_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict uuid;
begin
  if new.telegram_chat_id is null then
    return new;
  end if;

  select p2.id into v_conflict
  from people p1
  join people p2 on p2.tour_id = p1.tour_id and p2.contact_id <> new.id
  join contacts c2 on c2.id = p2.contact_id
  where p1.contact_id = new.id
    and c2.telegram_chat_id = new.telegram_chat_id
  limit 1;

  if v_conflict is not null then
    raise exception 'telegram account % already in use on a shared tour', new.telegram_chat_id
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_contact_telegram_unique on contacts;
create trigger enforce_contact_telegram_unique
  before update of telegram_chat_id on contacts
  for each row
  when (new.telegram_chat_id is distinct from old.telegram_chat_id)
  execute function enforce_contact_telegram_unique();
