-- Brief 52 step 5 (REE-132): let Reeve message its own account holder.
--
-- notification_log.person_id was `not null references people(id)`, so the send
-- ledger could only ever address crew, never the TM who owns the account. This
-- is the smallest correct slice: give an account a Telegram identity, let the
-- one-time link tokens point at an account rather than a contact, and let a
-- notification_log row target an account instead of a person.
--
-- All of this is additive or a widening (drop not null, add column, add a
-- partial index). Nothing is dropped, so it is safe to apply at any point
-- relative to the code deploy: there is no reader that stops existing.

-- 1. Account Telegram identity -----------------------------------------------

-- Mirrors contacts.telegram_chat_id (20260719025348): bigint because a Telegram
-- chat id exceeds the 32-bit range, and it does not exist until the account
-- holder has messaged the bot through the /start link. A chat id is per account,
-- not per tour (Matt, 2026-08-11), which is why it lives here and not on tours.
alter table accounts add column telegram_chat_id bigint;

-- Inbound resolution looks an account up by its chat id, same as the contacts
-- lookup index. Partial so it only indexes linked accounts.
create index accounts_telegram_chat_id_idx
  on accounts(telegram_chat_id) where telegram_chat_id is not null;

-- 2. Link tokens can point at an account instead of a contact ----------------

-- A token generated from account settings has no contact: the /start branch
-- resolves a null-contact_id token by writing accounts.telegram_chat_id. The
-- account_id column already on this table identifies whose account to link.
alter table telegram_link_tokens alter column contact_id drop not null;

-- 3. notification_log can target an account instead of a person --------------

-- A send now addresses exactly one of a person (crew) or an account (the TM).
alter table notification_log alter column person_id drop not null;

-- ON DELETE CASCADE, unlike person_id's RESTRICT (20260612050000). RESTRICT is
-- there because a deleted-and-re-added person gets a new UUID that resets the
-- dedup index; an account id mirrors auth.users and is never re-created, so that
-- risk does not exist. CASCADE also matches tour_id, so deleting the account
-- (the whole tenant) removes its log cleanly rather than being blocked by it.
alter table notification_log
  add column account_id uuid references accounts(id) on delete cascade;

-- Exactly one target. Existing rows all have person_id set and account_id null,
-- so num_nonnulls is 1 and the constraint applies cleanly. The pre-apply check
-- (`select count(*) from notification_log where person_id is null` must be zero)
-- guards the one way this could fail: a row with neither target set.
alter table notification_log
  add constraint notification_log_one_target
  check (num_nonnulls(person_id, account_id) = 1);

-- The existing notification_log_dedup unique index keys on person_id. For an
-- account row person_id is null, and NULLs are distinct in a unique index, so
-- that index does not dedup account sends at all. This partial index is the
-- durable double-send guard for the account target, mirroring the person one:
-- one send per account per channel per event.
create unique index notification_log_account_dedup_idx
  on notification_log (tour_id, account_id, notification_type, channel, dedup_dimension)
  where account_id is not null;
