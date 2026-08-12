-- Read state and the queue indexes for the Inbox (brief 53).
--
-- Additive only: no column is dropped or renamed, so this is safe to apply at
-- any point relative to a deploy and carries no deploy-order line.
--
-- updated_at is added here because the table predates the convention: it was
-- created two migrations before 20260609120008_updated_at_trigger.sql and was
-- never added to that trigger's list. It has never held a row, so this costs
-- nothing now and closes the gap before the first producer writes.

alter table attention_items add column read_at    timestamptz;
alter table attention_items add column updated_at timestamptz not null default now();

create trigger set_updated_at
  before update on attention_items
  for each row execute function set_updated_at();

-- The Inbox reads every open item the account owns, newest first, across every
-- tour. The existing (tour_id, resolved_at, severity desc) index is tour-first
-- and severity-ordered, so it serves neither this query nor the unread count.
-- That index is left in place: dropping it would make this migration
-- destructive for no gain, and it still suits a per-tour severity read.
--
-- There is no index on read_at, deliberately. The badge counts open items and
-- not unread ones (rule 1), so nothing ever filters or counts by read_at: it
-- only decides whether a row draws its dot. One partial index serves both the
-- queue and the count.
create index attention_items_open_idx
  on attention_items (created_at desc)
  where resolved_at is null;

-- Backfill: every forwarded email already waiting on the TM becomes an item,
-- so the Inbox is not empty on day one for an account that has been forwarding
-- mail. Idempotent through the not exists guard, so re-running is a no-op.
insert into attention_items (tour_id, kind, title, detail, related_table, related_id, created_at)
select fe.tour_id,
       'email_extraction',
       coalesce(nullif(fe.subject, ''), 'Forwarded email'),
       fe.from_address,
       'forwarded_emails',
       fe.id,
       fe.created_at
from forwarded_emails fe
where fe.extraction_status in ('pending', 'extracted', 'failed')
  and not exists (
    select 1 from attention_items ai
    where ai.related_table = 'forwarded_emails'
      and ai.related_id = fe.id
  );
