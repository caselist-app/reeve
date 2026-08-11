-- REE-100: a headliner is one item with an end time, not two.
--
-- Brief 42 gave every day time its own row, and it carried the old day-sheet
-- shape across literally: the twenty columns became kinds, so "headliner on" and
-- "headliner off" arrived as two separate day_items rows, as did "support on"
-- and "support off". On the calendar that reads as two cascading blocks for one
-- set (Headliner on 21:00, Headliner off 22:00), which is what this issue is
-- about. A set has a start and an end; it is one thing. day_items already
-- carries both starts_at and ends_at (that is how a catering window stores), so
-- the fix is to collapse each on/off pair onto a single windowed row:
--
--   headliner_on + headliner_off  ->  headliner   (starts_at = on, ends_at = off)
--   support_on   + support_off    ->  support     (starts_at = on, ends_at = off)
--
-- deploy-order: this does not drop a column, so check:conventions does not
-- force this marker, but the reasoning is the same one that took /itinerary
-- down on 2026-08-04 and it is worth stating. The crew-facing comms read the
-- headliner start (lib/comms/blocks/show-times.ts, morning-message.ts) and they
-- run only on Trigger.dev, which deploys separately from Vercel. Once this
-- migration merges the rows, code that still selects the 'headliner_on' kind
-- finds nothing. So the code that reads 'headliner' instead ships first, to both
-- runtimes, and this migration is applied after both are live. The check
-- constraint swap below also rejects the old kind names, so any writer still on
-- the old vocabulary would fail; Vercel deploys the new writers atomically on
-- merge, so by apply time nothing writes the old names either.

-- ---------------------------------------------------------------------------
-- 1. Drop the kind check constraint so the merge can write the new names and
--    shed the old ones. Found by definition rather than by name: the constraint
--    was declared inline on the column in the create-table migration and its
--    auto-generated name is an implementation detail we should not depend on.
-- ---------------------------------------------------------------------------

do $$
declare
  v_conname text;
begin
  select conname
  into v_conname
  from pg_constraint
  where conrelid = 'public.day_items'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%headliner_on%';

  if v_conname is not null then
    execute format('alter table public.day_items drop constraint %I', v_conname);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Merge each on/off pair into one windowed row.
--
-- One window per (tour_date_id, show_id). The surviving row is the earliest
-- 'on' (it holds the start and any title/notes/location the TM set); if there
-- is no 'on', the earliest 'off' survives as a start-only item, because an end
-- with no start cannot exist (day_items_end_needs_start). The window end is the
-- latest 'off' time, and only when it is genuinely after the surviving start:
-- a null or earlier value leaves ends_at null rather than inventing a backwards
-- window that day_items_end_after_start would reject. A show has at most one of
-- each from the Brief 42 backfill, so this collapses the ordinary case exactly
-- and degrades sanely (one window) for the rare hand-entered duplicate.
-- ---------------------------------------------------------------------------

do $$
declare
  r        record;
  v_survivor uuid;
  v_end      timestamptz;
begin
  for r in
    select on_kind, off_kind, merged_kind from (values
      ('headliner_on', 'headliner_off', 'headliner'),
      ('support_on',   'support_off',   'support')
    ) as pairs(on_kind, off_kind, merged_kind)
  loop
    -- Walk each (day, show) group that has either half of this pair.
    for v_survivor in
      select id from (
        select
          coalesce(
            (select o.id
               from day_items o
              where o.tour_date_id = g.tour_date_id
                and o.show_id is not distinct from g.show_id
                and o.kind = r.on_kind
              order by o.starts_at nulls last, o.created_at
              limit 1),
            (select f.id
               from day_items f
              where f.tour_date_id = g.tour_date_id
                and f.show_id is not distinct from g.show_id
                and f.kind = r.off_kind
              order by f.starts_at nulls last, f.created_at
              limit 1)
          ) as id
        from (
          select distinct tour_date_id, show_id
          from day_items
          where kind in (r.on_kind, r.off_kind)
        ) g
      ) survivors
      where id is not null
    loop
      -- The window end: latest 'off' in this group, scoped to the survivor's
      -- own (day, show).
      select max(x.starts_at)
      into v_end
      from day_items x
      join day_items s on s.id = v_survivor
      where x.tour_date_id = s.tour_date_id
        and x.show_id is not distinct from s.show_id
        and x.kind = r.off_kind;

      update day_items s
      set kind = r.merged_kind,
          ends_at = case
            when v_end is not null
             and s.starts_at is not null
             and v_end > s.starts_at
            then v_end
            else null
          end
      where s.id = v_survivor;

      -- Everything else in this (day, show) pair is now redundant.
      delete from day_items d
      using day_items s
      where s.id = v_survivor
        and d.tour_date_id = s.tour_date_id
        and d.show_id is not distinct from s.show_id
        and d.kind in (r.on_kind, r.off_kind)
        and d.id <> v_survivor;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Re-add the kind check with the merged vocabulary. Sixteen kinds now: the
--    eighteen from Brief 42 minus the four on/off names, plus 'headliner' and
--    'support'. lib/schedule/day-item-kinds.ts holds the same set, and
--    scripts/check-conventions.mjs rule 10 fails the build if they disagree.
-- ---------------------------------------------------------------------------

alter table day_items
  add constraint day_items_kind_check check (kind in (
    'lobby_call','venue_access','load_in','line_check','soundcheck','vip',
    'doors','support','changeover','headliner',
    'curfew','load_out',
    'catering_breakfast','catering_lunch','catering_dinner',
    'other'
  ));
