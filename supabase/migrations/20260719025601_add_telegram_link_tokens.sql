-- Brief 24: Telegram linking tokens.
--
-- Telegram identity (chat_id) does not exist until the person has messaged the
-- bot. This table is the one-time linking step: the TM generates a link, the
-- crew member taps it and hits Start, the webhook resolves the token back to
-- a contact and sets contacts.telegram_chat_id.
--
-- gen_random_bytes is a pgcrypto function, unlike gen_random_uuid which is
-- core Postgres. Guard defensively in case this project doesn't already have
-- it enabled.
create extension if not exists pgcrypto;

-- Token default: 18 random bytes, base64-encoded, made URL-safe with
-- translate() (swaps '+' -> '-', '/' -> '_', drops '=' padding since the
-- replacement list is shorter than the source list). Deliberately not using
-- encode(..., 'base64url'): that format was only added in the PostgreSQL 18
-- development cycle and cannot be relied on across Supabase projects yet.
-- translate() produces the identical alphabet on every Postgres version.
-- Result uses only A-Z a-z 0-9 - _, exactly Telegram's allowed deep-link
-- character set, comfortably under its 64-character limit.
create table telegram_link_tokens (
  token text primary key default translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_'),
  contact_id uuid not null references contacts(id) on delete cascade,
  -- Denormalised from contacts so the RLS policy can use the same inline
  -- account_id = auth.uid() shape contacts already uses, without a join.
  account_id uuid not null references accounts(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index on telegram_link_tokens(contact_id);

alter table telegram_link_tokens enable row level security;

-- Single for all policy, matching the current convention (see
-- 20260617120000_rls_performance_fixes.sql) rather than separate select/write
-- policies.
create policy "account manages own link tokens" on telegram_link_tokens
  for all using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- Writes happen from both the authenticated TM (creating a link) and the
-- webhook's admin client (marking a token used). No delete: tokens are
-- append-mostly, same reasoning as document_share.
grant select, insert, update on telegram_link_tokens to authenticated;
grant select, insert, update on telegram_link_tokens to service_role;
