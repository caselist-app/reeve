-- REE-315: accounts.telegram_chat_id needs to be unique, not merely indexed.
--
-- 20260811223110 added the column and a plain partial index for lookup, but
-- the design (one TM, one Telegram identity, globally, Brief 64) never allowed
-- two accounts to share a chat id. Nothing enforced that: two accounts could
-- link the same Telegram chat, and inbound resolution would have no way to
-- tell which one a message was for. Replacing the plain index with a unique
-- one is safe to apply at any point relative to a code deploy: nothing writes
-- a duplicate chat id today, so there is no existing row for the constraint to
-- reject.
drop index if exists accounts_telegram_chat_id_idx;

create unique index accounts_telegram_chat_id_idx
  on accounts(telegram_chat_id)
  where telegram_chat_id is not null;
