-- REE-293: first half of the PRODUCTION / LX / HOSPITALITY consolidation
-- (REE-291), decided in REE-292. Expand step: add the two new columns and
-- backfill them, drop nothing yet.
--
-- Merge rule (REE-292 decision comment, which supersedes the earlier draft
-- text on this issue that also mentioned status_travel): PRODUCTION is
-- audio + staging only, most-advanced-wins. Travel is being dropped from
-- show_advance entirely rather than folded in, since it is the one
-- department with no rider and is already tracked by hand; that drop is
-- its own later contract migration, tracked separately, and needs its own
-- deploy-order line when it lands. status_hospitality is untouched here,
-- it already has the right name.
alter table show_advance
  add column status_production text not null default 'not_started'
    check (status_production in ('not_started', 'in_progress', 'done')),
  add column status_lx text not null default 'not_started'
    check (status_lx in ('not_started', 'in_progress', 'done'));

update show_advance
set status_production = case
    when status_audio = 'done' or status_staging = 'done' then 'done'
    when status_audio = 'in_progress' or status_staging = 'in_progress' then 'in_progress'
    else 'not_started'
  end,
  status_lx = status_lighting;
