-- accounts: the only authenticated principal (TM or PM).
-- id mirrors auth.users so we never need a join for ownership checks.
create table accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  default_home text not null default 'tm' check (default_home in ('tm', 'pm')),
  stripe_customer_id text,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table accounts enable row level security;

create policy "account reads self" on accounts
  for select using (id = auth.uid());

create policy "account updates self" on accounts
  for update using (id = auth.uid());

-- tours: the ownership root. Every tour-scoped table points back here.
-- artist_slug powers the advancing@ subdomain per tour.
create table tours (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  artist_act text not null,
  start_date date,
  end_date date,
  territory text,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'completed', 'archived')),
  base_currency text not null default 'GBP',
  artist_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on tours(account_id);
alter table tours enable row level security;

-- Tours use an inline check: the RLS helper references tours, so it must
-- not be used here to avoid a circular dependency.
create policy "owner reads tours" on tours
  for select using (account_id = auth.uid());

create policy "owner writes tours" on tours
  for all using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- owns_tour: the single ownership check reused by every tour-scoped RLS policy.
-- security definer so it runs as the function owner, not the calling role.
-- All tour-scoped policies must use this helper; no policy may inline its own
-- ownership query. One drifted policy is a cross-tour data leak.
create or replace function owns_tour(p_tour_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tours
    where id = p_tour_id
      and account_id = auth.uid()
  );
$$;
