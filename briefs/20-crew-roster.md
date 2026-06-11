# Brief 20: Crew Roster (account-level contacts)

## What this is

Today a person only exists inside one tour. The `people` table is hard-scoped to `tour_id`, there is no `account_id`, and there is no link between the same human across two tours. When a TM starts a new tour, FOH Dave is re-entered from scratch: name, phone, passport number, passport expiry, dietary, allergies, all typed again. The same physical person becomes N unrelated rows, and when his passport renews there is no single place to fix it.

This brief introduces an account-level roster as the single source of truth for who a person is. A `contact` holds the identity of a human (passport, dietary, allergies, emergency contact, channels) once, at the account level. A tour `person` becomes a membership: it links a contact to a tour and holds only what is true *for that tour* (their role on it, their rates on it, their seat and PNR). Identity is read live from the contact, so updating a passport in one place is correct on every tour.

The driving use case is fast, correct lookup: "what is Dave's passport number", "who is coeliac", "update Sarah's passport, it just renewed", without opening an old tour and without the answer ever being stale.

The visible change for the TM: a new top-level "Roster" section (outside any tour) that is a searchable list of everyone they have toured with, and a single update point for each person. On a tour, adding crew means picking from the roster (or adding a new contact, which also lands in the roster).

---

## The model in one line

A `contact` is the person. A `person` row is "this contact is on this tour, in this role, on these terms." Identity lives on the contact and is read live. Per-tour terms live on the person. Rates live on `crew_detail` per tour, unchanged.

### Why identity is live, not copied

There is one true current value for a passport number. Copying it onto each tour and syncing the copies is a denormalization whose failure mode is a wrong passport on a boarding pass. So identity is stored once on the contact and referenced.

Historical documents are not put at risk by this. A boarding pass, day sheet, or settlement that has already been sent is a stored artifact that captured its values when it was generated; it does not read the live record, so updating the contact later does not alter it. Live reference for the working record, snapshot at the point a document is issued. That is the standard separation and it is the one to follow here.

### Why account-level fits the auth model

`account` is the only auth principal and tour-scoped tables scope by `owns_tour(tour_id)`. The roster sits above tours, so `contacts` scopes by `account_id = auth.uid()` directly, the same inline pattern `tours` already uses (it cannot use `owns_tour`, which itself reads `tours`). No new auth concept. A `person` reading its contact is a tour-to-account read inside the same account, which the contacts policy already permits. No cross-tour read is introduced.

---

## Data model changes

### New table: `contacts` (identity, account-level)

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  photo_url text,
  contact_email text,
  contact_phone text,
  preferred_channel text check (preferred_channel in ('whatsapp', 'sms')),
  whatsapp_number text,
  sms_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  dietary text,
  allergies text,
  home_city text,
  passport_number text,
  passport_expiry date,
  passport_country text,
  tshirt_size text,
  -- defaults pre-fill the per-tour terms when added to a tour; not the live tour value
  default_person_type text not null default 'crew'
    check (default_person_type in ('artist', 'crew', 'management', 'support')),
  default_role text,
  default_per_diem_rate numeric(10, 2),
  default_per_diem_currency text,
  default_daily_wage_rate numeric(10, 2),
  default_wage_currency text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on contacts(account_id);
create index on contacts(account_id, name);

alter table contacts enable row level security;

create policy "account reads own contacts" on contacts
  for select using (account_id = auth.uid());

create policy "account writes own contacts" on contacts
  for all using (account_id = auth.uid())
  with check (account_id = auth.uid());
```

The un-prefixed fields are identity: read live by every tour the contact is on. The `default_` fields seed the per-tour terms when a contact is added to a tour and are not themselves the live tour value. `notes` is private roster-only text ("drives the splitter", "aisle seat"), never copied or sent.

### `people` becomes a thin membership

Identity columns move off `people` onto `contacts`. The `person` row keeps only the link to the contact and what is genuinely per-tour.

```sql
-- add the link first (nullable for backfill), then backfill, then enforce
alter table people add column contact_id uuid references contacts(id) on delete restrict;
```

After backfill (below), `people` should retain:

```
id, tour_id, contact_id (NOT NULL), person_type, role,
created_at, updated_at
```

and drop the identity columns now sourced from the contact:

```sql
alter table people
  drop column name,
  drop column photo_url,
  drop column contact_email,
  drop column contact_phone,
  drop column preferred_channel,
  drop column whatsapp_number,
  drop column sms_number,
  drop column emergency_contact_name,
  drop column emergency_contact_phone,
  drop column dietary,
  drop column allergies,
  drop column home_city,
  drop column passport_number,
  drop column passport_expiry,
  drop column passport_country,
  drop column tshirt_size;
```

`person_type` and `role` stay on `people`: a person can be crew on one tour and support on another, and roles differ per tour. `contact_id` is `on delete restrict`: you cannot delete a contact who is still on a tour. The app removes them from tours first, or the roster delete is blocked with a clear message.

Uniqueness: one contact appears at most once per tour.

```sql
create unique index on people(tour_id, contact_id);
create index on people(contact_id);
```

### Inbound WhatsApp mapping moves to the join

The old `unique (tour_id, whatsapp_number)` index lived on `people`. The number is now identity on the contact, but routing is still per-tour. Resolve an inbound number to a person by joining: find the `person` on the message's tour whose `contact.whatsapp_number` matches. The "one number, one person per tour" guarantee now comes from `unique(tour_id, contact_id)` plus a contact having a single WhatsApp number. A partial unique index on `contacts(account_id, whatsapp_number)` (where not null) keeps one human per number within an account and makes the lookup unambiguous.

### `crew_detail` unchanged

Per-tour rates stay exactly as they are: `crew_detail` keyed by `person_id`, scoped by `tour_id`. Rates are per-tour by nature and are never synced from the contact; the contact only carries `default_*_rate` values to pre-fill them.

---

## Backfill migration

Existing `people` rows already hold identity. The migration lifts each into a contact and relinks.

Single migration: `20260612000000_crew_roster.sql`. Steps, all in one file:

1. Create `contacts` (indexes, RLS, GRANTs).
2. Add nullable `people.contact_id`.
3. Backfill: for each existing `people` row, insert a `contacts` row under that tour's `account_id`, copying the identity fields and seeding `default_role`/`default_person_type` from the person; set `people.contact_id` to the new contact. Pull rates from `crew_detail` into the contact's `default_*_rate` where present.
4. Set `people.contact_id` NOT NULL; add `unique(tour_id, contact_id)` and the `contact_id` index.
5. Add the partial unique index on `contacts(account_id, whatsapp_number)`.
6. Drop the moved identity columns from `people`.
7. Create the `add_contact_to_tour` RPC (below).
8. GRANTs for the new table and RPC.

Backfill cannot know that Dave-on-tour-A and Dave-on-tour-B are the same human, so each existing person becomes its own contact. The TM merges duplicates later (out of scope here; see exclusions). This is the only safe automatic behaviour.

GRANTs follow the existing pattern:

```sql
grant select, insert, update, delete on contacts to service_role;
grant execute on function add_contact_to_tour(uuid, uuid, text, text) to authenticated, service_role;
```

---

## Adding a contact to a tour

One RPC creates the membership. It does not copy identity (identity stays on the contact); it only sets the per-tour terms, seeding them from the contact's defaults.

```sql
create or replace function add_contact_to_tour(
  p_tour_id uuid,
  p_contact_id uuid,
  p_person_type text default null,
  p_role text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact contacts;
  v_person_id uuid;
  v_type text;
begin
  if not owns_tour(p_tour_id) then
    raise exception 'not authorised for tour';
  end if;

  select * into v_contact from contacts
  where id = p_contact_id and account_id = auth.uid();
  if not found then
    raise exception 'contact not found';
  end if;

  v_type := coalesce(p_person_type, v_contact.default_person_type);

  insert into people (tour_id, contact_id, person_type, role)
  values (p_tour_id, p_contact_id, v_type, coalesce(p_role, v_contact.default_role))
  returning id into v_person_id;

  if v_type = 'crew' then
    insert into crew_detail (
      person_id, tour_id, per_diem_rate, per_diem_currency,
      daily_wage_rate, wage_currency
    ) values (
      v_person_id, p_tour_id,
      v_contact.default_per_diem_rate, v_contact.default_per_diem_currency,
      v_contact.default_daily_wage_rate, v_contact.default_wage_currency
    );
  end if;

  return v_person_id;
end;
$$;
```

Adding a brand-new person to a tour is two steps the UI does together: insert a `contact` (it appears in the roster immediately), then call `add_contact_to_tour`. There is no "person without a contact" path any more, which is what makes the roster complete by construction.

De-dup on contact creation: before inserting, soft-match on `whatsapp_number` then `contact_email` within the account and prompt "this looks like X already in your roster, use them instead?". Suggestion only, never auto-merge.

---

## Read paths that change

Anything that read identity off `people` now reads it off the joined `contact`. These are the touch points:

- Comms templates in `lib/comms/` that render a person's name, dietary, or passport now select `people` joined to `contacts`.
- The inbound WhatsApp resolver joins `people` to `contacts` on the tour to map a number to a person.
- Any person list/detail UI inside a tour joins the contact for identity, while role and rates stay local.

Rates, role, advance, planner, day sheets: unchanged. They never read identity, or they read it through the same join.

---

## Route changes

### New account-level roster list: `/roster`

Outside the tour shell, in the account-level nav. A searchable, filterable table of all contacts. Each row: name, default role, home city, passport expiry (warning colour if expired or within 90 days), a dietary/allergy indicator. Search matches name, role, city. This is the quick-lookup surface that is the point of the brief.

### Contact detail: `/roster/[contactId]`

The single editable record for the human: all identity fields, defaults, notes. Editing the passport here is the one update that corrects every tour. An "On tours" panel lists every `person` row for this contact and its tour, so the TM sees "Dave: Summer 25, Festival run 25, Spring 26" and can jump to any.

### Tour add-crew: pick from roster or add new

The add-crew surface becomes: search the roster and add (calls `add_contact_to_tour`), or "new person" which creates a contact and adds them in one go. After adding, the TM sets role and rate *for this tour* without touching the contact.

---

## Code changes required (beyond migration)

1. **`lib/types/database.ts`**: regenerate after migration (`pnpm types:gen`).
2. **`lib/validators/`**: new Zod schema for the contact form; trim the person schema down to per-tour fields.
3. **`lib/comms/`**: update person-rendering templates and the inbound WhatsApp resolver to read identity via the `people` to `contacts` join.
4. **`app/roster/page.tsx`**: new roster list with search and passport-expiry warning.
5. **`app/roster/[contactId]/page.tsx`**: new contact detail with the "On tours" panel.
6. **Account nav**: add "Roster".
7. **Tour add-crew surface**: roster picker plus "new person", calling `add_contact_to_tour`.
8. **Tour person detail**: show identity as read from the contact (with a link to edit it on the contact), keep role and rates editable locally.

---

## Decisions (resolved)

1. **Identity is the single source of truth on the contact, read live.** Not copied per tour. Chosen for correctness; the failure mode of duplicated-and-synced identity (a stale passport on a sent document) is the one to design out.
2. **Per-tour terms stay on the tour.** `person_type`, `role` on `people`; rates on `crew_detail`. These legitimately differ per tour and are never synced from the contact.
3. **Historical documents are protected by being artifacts**, not by freezing the live record. A sent boarding pass or finalised settlement captured its values at generation and does not change.
4. **De-dup is a soft prompt, never auto-merge.** Match on WhatsApp number then email, surfaced as a suggestion.
5. **A contact in use cannot be deleted** (`on delete restrict`); remove from tours first.

---

## What this brief does NOT include

- Merging two existing contacts into one (needed because backfill makes one contact per historical person). A later dedup tool.
- Passport-expiry alerts off the roster (a natural "Alert" pillar feature: warn before any passport expires, even between tours). Schema supports it; the Trigger.dev job is a separate brief.
- Importing contacts from phone or CSV. Manual entry and the backfill only.
- Sharing a roster between accounts, or a "crew that follows the artist" concept. The roster is private to one account.
- Any change to the planner or the AI layer.
