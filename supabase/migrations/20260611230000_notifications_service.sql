-- Notifications service: channel preference + unified send log.
--
-- 1. Repurpose people.preferred_channel from ('whatsapp','sms') to
--    ('whatsapp','email','both'). SMS is gone; email is now a real channel.
-- 2. Add notification_log: one row per (person, channel) send. Its unique
--    index is the durable idempotency guard (replaces Redis SET NX for sends)
--    and the audit + delivery-receipt surface for both WhatsApp and email.
--    broadcast_log is superseded by this table and removed in a later
--    migration once no code references it.

-- 1. Channel preference -------------------------------------------------------

-- Inline column checks are auto-named {table}_{column}_check.
alter table people drop constraint people_preferred_channel_check;

-- SMS is retired: anyone previously on SMS (or unset) defaults to WhatsApp.
update people
  set preferred_channel = 'whatsapp'
  where preferred_channel = 'sms' or preferred_channel is null;

alter table people alter column preferred_channel set default 'whatsapp';
alter table people alter column preferred_channel set not null;
alter table people add constraint people_preferred_channel_check
  check (preferred_channel in ('whatsapp', 'email', 'both'));

-- 2. notification_log ---------------------------------------------------------

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  notification_type text not null,        -- morning_message, boarding_pass, ...
  channel text not null check (channel in ('whatsapp', 'email')),
  dedup_dimension text not null,          -- show date, assignment id, change id
  status text not null default 'sent'
    check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  provider_message_id text,               -- wamid (WhatsApp) or Resend id
  error text,                             -- failure detail when status = 'failed'
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Durable idempotency: one send per person per channel per event.
-- The send path inserts before sending; a unique violation means already sent.
create unique index notification_log_dedup
  on notification_log (tour_id, person_id, notification_type, channel, dedup_dimension);

-- Match Meta and Resend delivery/read receipts back to the row.
create index notification_log_provider_message_id
  on notification_log (provider_message_id) where provider_message_id is not null;

-- Tour-scoped reads, newest first (TM observability views).
create index notification_log_tour_created
  on notification_log (tour_id, created_at desc);

alter table notification_log enable row level security;

-- TMs read their own tours' send history. They never write it.
create policy "owner reads notification_log" on notification_log
  for select using (owns_tour(tour_id));

-- Writes come only from Trigger.dev jobs and provider webhooks (service role).
-- Least privilege: authenticated gets read only.
grant select on notification_log to authenticated;
grant select, insert, update on notification_log to service_role;

create trigger set_updated_at before update on notification_log
  for each row execute function set_updated_at();
