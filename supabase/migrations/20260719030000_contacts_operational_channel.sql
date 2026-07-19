-- Brief 24: replace contacts.preferred_channel with two independent settings.
--
-- "both" stopped being well-defined once Telegram is a real third option:
-- both of which two? Email already serves a structurally different purpose
-- (formal riders and advancing documents, not the operational day-to-day
-- stream) from the WhatsApp-or-Telegram operational choice, so it splits
-- into its own boolean rather than staying folded into a three-way enum.
-- operational_channel is nullable: a brand-new contact with no WhatsApp
-- number and no Telegram link yet has no operational channel, a real and
-- current state, not an error.

alter table contacts add column operational_channel text
  check (operational_channel in ('whatsapp', 'telegram'));
alter table contacts add column email_enabled boolean not null default false;

update contacts set operational_channel = 'whatsapp', email_enabled = false
  where preferred_channel = 'whatsapp';
update contacts set operational_channel = null, email_enabled = true
  where preferred_channel = 'email';
update contacts set operational_channel = 'whatsapp', email_enabled = true
  where preferred_channel = 'both';

-- Dropping the column also drops its inline check constraint
-- (contacts_preferred_channel_check).
alter table contacts drop column preferred_channel;

-- Widen notification_log.channel so a Telegram send has somewhere honest to
-- log against, same idempotency ledger already used by WhatsApp and email.
-- Not called out in the brief; found while wiring notify() for a third
-- channel.
alter table notification_log drop constraint notification_log_channel_check;
alter table notification_log add constraint notification_log_channel_check
  check (channel in ('whatsapp', 'email', 'telegram'));
