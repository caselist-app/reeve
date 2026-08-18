-- REE-283: advance recipients shouldn't be roster entries.
--
-- document_shares.recipient_person_id forced every rider recipient to exist
-- as a people row first, so sending an advance to a venue or promoter contact
-- (who is never crew and never belongs on the roster) meant adding them to
-- the roster just to send them a document. A share can now target a freeform
-- email address instead of a person.
--
-- Additive and widening only (drop not null, add column, add a check that
-- existing rows already satisfy): safe to apply at any point relative to the
-- code deploy, same reasoning as 20260811223110_account_telegram_and_notify_target.sql.

alter table document_shares
  alter column recipient_person_id drop not null;

alter table document_shares
  add column recipient_email text;

-- Exactly one recipient. Every existing row has recipient_person_id set and
-- recipient_email null, so num_nonnulls is 1 and the constraint applies
-- cleanly to current data.
alter table document_shares
  add constraint document_shares_one_recipient
  check (num_nonnulls(recipient_person_id, recipient_email) = 1);
