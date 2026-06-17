-- Fix two classes of RLS performance warnings.
--
-- Issue 1: auth_rls_initplan
--   auth.uid() called directly in a policy is re-evaluated for every row in
--   the result set. Wrapping it in (select auth.uid()) tells Postgres to
--   evaluate it once per query as an InitPlan.
--   Affects: accounts, tours, contacts, artists.
--
-- Issue 2: multiple_permissive_policies
--   Every table has both a FOR SELECT policy ("owner reads ...") and a FOR ALL
--   policy ("owner writes ..."). FOR ALL already covers SELECT, so on every
--   SELECT query Postgres evaluates both policies unnecessarily. Fix: drop the
--   redundant FOR SELECT policies.
--   Affects: all tour-scoped tables plus contacts and tours.
--
-- contacts and tours appear in both lists. They are handled in a single
-- drop+recreate that fixes both issues at once.

-- ── accounts (issue 1 only: no overlapping policies) ─────────────────────────

drop policy "account reads self" on accounts;
drop policy "account updates self" on accounts;

create policy "account reads self" on accounts
  for select using (id = (select auth.uid()));

create policy "account updates self" on accounts
  for update using (id = (select auth.uid()));

-- ── tours (issues 1 + 2: drop both, recreate as single FOR ALL) ───────────────

drop policy "owner reads tours" on tours;
drop policy "owner writes tours" on tours;

create policy "owner writes tours" on tours
  for all using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- ── contacts (issues 1 + 2: drop both, recreate as single FOR ALL) ────────────

drop policy "account reads own contacts" on contacts;
drop policy "account writes own contacts" on contacts;

create policy "account writes own contacts" on contacts
  for all using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- ── artists (issue 1 only: single FOR ALL policy, just recreate it) ───────────

drop policy "artists: owner full access" on artists;

create policy "artists: owner full access" on artists
  for all using (account_id = (select auth.uid()));

-- ── remaining tables (issue 2 only: drop the redundant FOR SELECT policies) ───
-- The FOR ALL policy on each table already covers SELECT.

drop policy "owner reads attention"   on attention_items;
drop policy "owner reads crew_detail" on crew_detail;
drop policy "owner reads day_sheets"  on day_sheets;
drop policy "owner reads documents"   on documents;
drop policy "owner reads hotels"      on hotel_stays;
drop policy "owner reads people"      on people;
drop policy "owner reads rehearsals"  on rehearsals;
drop policy "owner reads rooms"       on room_assignments;
drop policy "owner reads show_advance" on show_advance;
drop policy "owner reads shows"       on shows;
drop policy "owner reads tour_dates"  on tour_dates;
drop policy "owner reads assignments" on transport_assignments;
drop policy "owner reads transport"   on transport_segments;
