-- REE-298: contract half of the PRODUCTION / LX / HOSPITALITY consolidation
-- (REE-291, decided in REE-292). 20260818163329_add_status_production_status_lx_to_show_advance.sql
-- was the expand step: it added status_production and status_lx and backfilled
-- them from the columns this file drops. status_hospitality already had the
-- right name and is untouched, both there and here.
--
-- Every reader of status_audio, status_lighting and status_staging moved to
-- status_production / status_lx in REE-294 (core engine), REE-296 (UI) and
-- REE-297 (AI crew Q&A context). status_travel had no replacement: per the
-- REE-292 decision comment carried in the expand migration, travel is the one
-- department with no rider and is already tracked by hand, so it is dropped
-- from show_advance entirely rather than folded into another column.
--
-- deploy-order: REE-293 through REE-297 are merged into main at commit
-- 2099782 (REE-303), and that commit's push-to-main CI run (not a PR run)
-- shows "Deploy Trigger.dev jobs" completed successfully alongside the
-- Vercel build, confirmed 2026-08-18. Both runtimes are running code that no
-- longer reads status_audio, status_lighting, status_staging or
-- status_travel. lib/ai/context.ts is the one reader reached only from
-- Trigger.dev (the WhatsApp routers), which is the exact path that took
-- /itinerary down on 2026-08-04, so its REE-297 update is the one this drop
-- depends on most.
--
-- A repo-wide grep for the four column names, run against this same commit,
-- turns up nothing outside this migration, the original 20260609120002_shows.sql
-- create statement, and the generated lib/types/database.ts (which still lists
-- them until pnpm types:gen runs against the applied migration). Documents'
-- doc_type has no check constraint listing the pre-REE-295 rider values
-- (tech_rider, staging_rider, lighting_rider), so there is nothing to drop
-- there: 20260609120005_documents.sql declares doc_type as plain text.
--
-- Nothing to back up. status_production and status_lx already carry
-- status_audio/status_staging's and status_lighting's data respectively, and
-- status_travel's values were never read anywhere but the day-info advance
-- block this same consolidation replaced.

alter table show_advance
  drop column status_audio,
  drop column status_lighting,
  drop column status_staging,
  drop column status_travel;
