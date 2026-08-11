# OPERATIONS.md

What is true about the running world, as opposed to the code. `CLAUDE.md` says how to write Reeve. This says what is true about the systems Reeve runs on, the tooling around it, and the things that have actually broken production.

**This is the only place these facts live.** They used to be spread across `CLAUDE.md`, the Notion STATUS page, three agent skills and a memory file, and several of them were stale in some copies and correct in others for days at a time. If you find one of these facts restated somewhere else, that copy is wrong by construction: delete it and point here.

**Every entry carries the date it was confirmed.** A fact with no date is a rumour. If you cannot confirm one from a session, say so rather than restating it.

## The numbers

**Run `pnpm facts`.** It prints the baseline count and its split, the enforced rule count, the three test-suite file counts, the migration count and the `[BOTH]` env var count, computed from the repo at the moment you ask.

**No number about this repo is written down, here or anywhere else, and that includes this file.** The first version of this section carried a generated block that `check:conventions` compared against the computed values. It went stale the same day it landed: a pull request adding one unit test file turned `main` red without touching this file at all, because the block had been generated before that test existed. A committed block is still a number written down. `check:conventions` rule 12 now fails any doc that states the baseline count in prose, and there is nothing left to regenerate.

## The gates

`pnpm check` is `typecheck && lint && check:conventions && test && build`, in CI's order. **One command, five gates.** Running the parts separately is slower and misses two of them.

`pnpm check` deliberately runs the unit tests only. It is the gate Matt runs himself and it has to keep working on a machine with no Docker.

| Suite | Command | Where it can run |
| --- | --- | --- |
| unit | `pnpm test` | Anywhere |
| integration | `pnpm test:integration` | CI only, needs real Postgres |
| e2e | `pnpm test:e2e` | CI only, needs a real browser and a real build |

**Integration and e2e are proved by pushing and reading the CI log, never by claiming they passed.** CI's three jobs are `Typecheck, lint, build`, `Integration tests` and `End-to-end tests`.

**vitest does not run in an agent sandbox** (confirmed 2026-08-11): `node_modules` holds macOS native binaries and rolldown fails to load. `tsc` and `scripts/check-conventions.mjs` do run there. To prove a pure function without vitest, compile it with `tsc` to a scratch directory and exercise it under node, and say that is what you did.

## The two runtimes

**Vercel runs the Next.js app. Trigger.dev runs everything in `trigger/jobs/`.** They do not share environment variables and they are the single largest source of silent production failure here.

- **This has broken production twice.** Once when the Meta credentials were set in Vercel only, so the inbound WhatsApp webhook returned a healthy 200 for every message it failed to answer. Once when a migration dropped `shows.load_in_at` and `shows.curfew_at` while Trigger.dev still ran the code selecting them, and `/itinerary` (which runs **only** on Trigger.dev) told a crew member their tour had no shows. Vercel's logs were clean throughout both.
- **A job's failure is invisible from Vercel.** Jobs run after the webhook has already returned 200. If a send does not arrive, check the Trigger.dev run before reading any code.
- **CI deploys Trigger.dev on merge to `main`** (confirmed working end to end by Matt on the Brief 42 merge, PR #37, 2026-08-05). So both runtimes do ship from one merge, which is what makes a contract migration safe. **Check the push-to-`main` run, not the PR run:** `deploy-trigger` is excluded from pull requests, so a green PR run says nothing about whether Trigger.dev deployed. The job fails loudly by design if `TRIGGER_ACCESS_TOKEN` goes missing.

## What can and cannot be verified from a session

| System | Verifiable? | How |
| --- | --- | --- |
| GitHub | **Yes**, since 2026-08-06 | `gh` 2.97.0 at `/opt/homebrew/bin/gh`, authenticated against `caselist-app/reeve`. `gh pr view <n> --json state,statusCheckRollup` |
| Supabase schema | Yes | `pnpm types:gen` and `supabase inspect db` read the live remote without Docker. `table-stats` for tables, `index-stats` for indexes |
| Supabase RLS policies | No | A `pg_policies` query Matt runs in the SQL editor |
| Supabase row contents | No | Write the exact SQL for Matt to run |
| Vercel | No | Ask Matt |
| Trigger.dev | No | Ask Matt |
| Provider dashboards and quotas | No | Ask Matt |

**A grep proves what the code says, never what is running.** Older handoffs say `gh` is not installed; they are wrong. `supabase db diff` and `db dump` both need Docker and are unavailable.

**Reading a green CI run still says nothing about what is deployed.** And check a run's commit SHA before believing it: `ci.yml` sets `cancel-in-progress`, so a cancelled run sits next to an older green one and reads as current. A green run was once read as belonging to a commit that deliberately broke a page, costing about an hour.

## Supabase

- **`supabase db push` is safe again, confirmed 2026-08-06.** The fault was that `supabase_migrations.schema_migrations` on production was empty while all 51 migrations had in fact run, so the CLI offered to replay every one of them. Diagnosed read-only as REE-25, then fixed with `supabase migration repair --status applied <all 51>`, which writes history rows and no DDL. `migration list --linked` now matches on both sides. **Any note saying `db push` replays the whole history is stale.** It was still being repeated in three places on 2026-08-11.
- **Matt runs every migration himself.** Write them, never apply them. This has not changed and is not about `db push` being safe.
- **Preview deployments point at the production Supabase project** (confirmed by Matt 2026-08-05, tracked as REE-16, urgent). Every PR preview reads and writes real tour data with a real service role key, including PRs opened unattended by Cyrus. **A second Supabase project is not the fix to propose: Matt cannot afford it, stated 2026-08-10.** The zero-cost fix is removing the Supabase variables from the Preview scope in Vercel, or turning preview deployments off: CI already builds and runs both suites against an ephemeral Supabase on every PR, so previews are a click-around convenience, not the safety net.

## Secrets and their scopes

- **`E2E_LOGIN_SECRET` is in the GitHub repo secrets** (added 2026-08-05). Without it the dev login route returns 404 and no e2e spec can sign in. **It must never be set in Vercel or Trigger.dev:** its absence is what makes that route non-existent in production.
- **`TRIGGER_ACCESS_TOKEN` is in the GitHub repo secrets.**
- **One secret, one name.** There is one Meta app and therefore one app secret, `META_APP_SECRET`, read by both `app/api/whatsapp/inbound/route.ts` and `app/api/data-deletion/route.ts`. It was briefly duplicated as `WHATSAPP_APP_SECRET`, which meant whichever name was left unset made that endpoint reject every request silently, because signature checks fail closed. Consolidated 2026-08-04. Do not reintroduce a second name for any provider credential.
- **Renaming a secret is a two-step deploy, in this order.** Add the new variable and confirm it is live, then ship the code that reads it, then remove the old one. Shipping the rename first takes the endpoint down the moment it deploys, and for the WhatsApp webhook that means every inbound crew message is rejected.
- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is browser-exposed by design** and must be a separate, HTTP-referrer-restricted key from the server-side `GOOGLE_MAPS_API_KEY`.

## Branch protection and review

- **Branch protection matches required checks by job name.** Confirmed 2026-08-11: the `STATUS_CHECKS` ruleset is `active`, scoped to the default branch, and requires `Typecheck, lint, build`, `Integration tests`, `End-to-end tests` and `Vercel`. The three CI job names match `.github/workflows/ci.yml` exactly, so a red suite blocks the merge. Renaming a job silently detaches the rule, so rename and update the ruleset together or not at all.
- **A green run is not evidence that anything is enforced, and this was live for an unknown period.** Until 2026-08-11 that same ruleset sat at `enforcement: disabled`, which meant nothing blocked a merge to `main`: not typecheck, not integration, not e2e. Every run still reported exactly as it does now, so the CI page looked identical either way. Classic branch protection is also absent, so `branches/main/protection` returns a 404 that proves nothing on its own. The query that actually answers it is `gh api repos/caselist-app/reeve/rules/branches/main`, which aggregates every rule from every source, repo and org, and returns `[]` when nothing applies.
- **Never use a git worktree on this repo.** Work on a named branch in `~/Documents/reeve` itself. Matt reviews in GitHub Desktop, which only shows the main checkout, so a worktree makes the work invisible and reads as changes going missing. `.claude/settings.json` sets `worktree.bgIsolation: "none"` to stop background sessions forcing one. On 2026-08-05 a worktree cost an hour and had him believing an agent had written into an unrelated repo.
- **Matt commits and pushes himself** unless he asks otherwise. Ask for sign-off before a commit. Every commit message carries its Linear issue ID.
- **File deletion works** from an agent session on macOS, confirmed 2026-08-11. An older note claimed the sandbox could delete nothing in the repo and that every deletion had to be handed over as a `git rm` list. If you are somewhere deletion genuinely fails, or a stale `.git/index.lock` appears, hand Matt the list and say why, but do not assume it.

## The limits of all of it

**Green is not evidence.** Every suite, plus typecheck, lint, conventions and build, was green when `/itinerary` told a crew member their tour had no shows. **No test in this repo could have caught it**, structurally: CI builds one database from the committed migrations and runs one codebase against it, so a runtime running stale code against a migrated database is invisible by construction.

**Built is not verified.** Brief 08's WhatsApp slash commands carried the label having never once worked end to end, through three stacked reasons. Brief 09's morning message was built and never once scheduled in production. When a claim matters, check it against a real handset or a real run.

**A brief is a hypothesis, not a finding.** Brief 36 named four consumers of `load_in_at`; there were twelve. Brief 42's own verification pass found five things the brief did not have.

**The honest limit.** Everything here catches classes that have already been named. Every sweep so far was seeded by a bug that had already bitten, so the class nobody has named yet stays invisible, and nothing changes that.

## Where everything lives

| Question | Answer |
| --- | --- |
| How to write Reeve code | `CLAUDE.md` |
| How components and panels work | `COMPONENTS.md` |
| What is true about the running world | This file |
| Any number about this repo | `pnpm facts` |
| What is being built, and what state each step is in | Linear. Team `Reeve`, prefix `REE` |
| Why a thing was decided | The Notion brief's "Decisions taken" section |
| What shipped | Linear project state, and a ✅ on the Notion brief title |
| What happened historically | The Notion Engineering Log |
| How an agent should write a brief, review, or hand off | The `reeve-brief-maker`, `reeve-qa-engine` and `reeve-handoff` skills. **Method only. They hold no facts and no numbers, deliberately.** |
