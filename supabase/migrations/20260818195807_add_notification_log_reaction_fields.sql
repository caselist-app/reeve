-- REE-274: the two columns a WhatsApp/Telegram reaction is recorded into, plus
-- the unique index the reaction lookup needs to find its row safely.
--
-- notification_log_provider_message_id was a plain (non-unique) partial index,
-- so a reaction webhook matching on provider_message_id could hit more than
-- one row. Replacing it with a unique index makes that lookup safe, but only
-- if the column is actually unique among non-null values today.
--
-- Pre-flight: run this in the Supabase SQL editor before applying and confirm
-- it returns no rows. If it does, resolve the duplicate first; this migration
-- must not be applied over one.
--
--   select provider_message_id, count(*)
--   from notification_log
--   where provider_message_id is not null
--   group by provider_message_id
--   having count(*) > 1;

alter table notification_log
  add column reacted_at timestamptz,
  add column reaction_emoji text;

drop index notification_log_provider_message_id;

create unique index notification_log_provider_message_id_key
  on notification_log (provider_message_id)
  where provider_message_id is not null;
