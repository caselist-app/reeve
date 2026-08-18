-- REE-283: a freeform-email advance recipient (see
-- document_shares_freeform_recipients.sql) has no person and no account
-- behind it, so advance-reminder's notification_log claim needs a third
-- target. Mirrors 20260811223110_account_telegram_and_notify_target.sql's
-- account_id addition: widen the "exactly one target" constraint and add a
-- third partial dedup index.

alter table notification_log
  add column recipient_email text;

alter table notification_log
  drop constraint notification_log_one_target;

alter table notification_log
  add constraint notification_log_one_target
  check (num_nonnulls(person_id, account_id, recipient_email) = 1);

-- The existing dedup indexes key on person_id and account_id respectively.
-- NULLs are distinct in a unique index, so neither dedups an email-targeted
-- row. This partial index is the durable double-send guard for that target.
create unique index notification_log_email_dedup_idx
  on notification_log (tour_id, recipient_email, notification_type, channel, dedup_dimension)
  where recipient_email is not null;
