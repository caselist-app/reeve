# Tests

Three suites, split by how much of the real thing each one runs.

```bash
pnpm test              # unit. Fast, no Docker, run these locally.
pnpm test:integration  # integration. Needs a running Supabase. CI runs these.
pnpm test:e2e          # end to end. Real browser, real build, real database. CI runs these.
```

`pnpm check` runs the unit tests and nothing else, deliberately. It is the one
gate Matt runs himself and it has to keep working on a machine with no Docker.

| Suite | Runs | Sees |
| --- | --- | --- |
| unit | pure functions | one function's logic |
| integration | real server actions against a real Postgres | writes, constraints, PostgREST semantics |
| e2e | a real browser against a production build | whether the page a TM opens actually renders |

The third exists because the second stops at the server action, and because
`next build` prerenders six routes, none of them under `app/(app)`. Everything
below that group reads `cookies()` and is therefore dynamic, so the build never
executes it. Before this suite, a Server Component that threw on the schedule
passed typecheck, lint, `check:conventions`, the unit tests and the build, and
then served a 500 to the only person using the product.

The three mocks in `tests/integration/setup.ts` are the other half of the
reason. They replace `next/cache`, `@/lib/supabase/server` and
`@/lib/auth/helpers`, which is correct for what that suite is for, and it means
the auth gate, RLS and the revalidate class are invisible to every test in it.
The e2e suite mocks nothing, and those three things are exactly what it watches.

## The rules this suite lives by

**A spec that flakes is deleted the same day it is noticed.** Not quarantined,
not retried. `playwright.config.ts` sets `retries: 0` and that is not up for
negotiation: a retry hides a flake, and a hidden flake is how a suite stops
meaning anything. If a spec found something real, fix the thing. If it did not,
delete it. Either way it does not stay red-sometimes.

**The suite does not grow by guesswork.** After these six specs, a new one is
added when a real bug reaches production, and it is added before the fix.

**A new page route needs a line in `smoke.spec.ts`.** The route-count test at
the bottom of that file fails on the commit that adds a route without one, which
is while whoever added it still knows what it needs to render.

**Every spec is named as a sentence about what a TM sees.** A red Playwright
line is the only thing read before deciding whether to merge.

## The webServer has to exit cleanly, not just pass

`playwright.config.ts`'s `webServer` starts a real production server
(`pnpm exec next start`) for every spec to hit, and teardown has to actually
kill it. It has not always: on 2026-08-11 the e2e job on the REE-94 PR had
every step, including the last one, report success, and the check-run still
sat in `pending` until GitHub's 6-hour ceiling. The cause was a `next-server`
grandchild that survived Playwright's default teardown and kept the runner's
stdio pipe open, so the job body finished but never finalized (REE-121).

Two things guard against this reappearing, and a change to either one should
be able to explain why it is still safe:

- `webServer.gracefulShutdown` in `playwright.config.ts` gives `next start` a
  SIGTERM it can act on before Playwright falls back to an unconditional
  SIGKILL of the process group. `command` runs through `pnpm exec` rather than
  `pnpm start`, one fewer layer of shell between Playwright and the process
  that actually needs the signal.
- The `e2e` job in `ci.yml` kills anything left listening on port 3000 as an
  unconditional step after the test step, whether or not the tests passed.
  This is the actual backstop: it does not depend on the graceful shutdown
  above having worked, it is what frees the runner if a future change to the
  server or to Playwright breaks it again. The job also carries
  `timeout-minutes`, so if something still holds the pipe open the job fails
  loudly within the hour instead of sitting until GitHub's ceiling.

## Reading a failure without running it locally

Neither of these suites runs on Matt's machine, so a CI log is the whole picture.

1. **Check the run's commit SHA first.** `ci.yml` sets `cancel-in-progress`, so
   a cancelled run sits in the list next to an older green one and reads as
   current. During Brief 41 a green run was read as belonging to a commit that
   deliberately broke a page, and it cost about an hour of wrong theories. The
   quickest sanity check is the test count in the e2e log: if it does not match
   the number of specs on the branch, the run is not the one you think.
2. **Read the failing line, then the `Expected`/`Received` block.** Route specs
   are named for the route, so the line names the page.
3. **Download the `playwright-report` artifact** for anything unclear. It
   carries both the HTML report and `test-results`, which holds a trace and an
   `error-context.md` page snapshot per failure. That snapshot is the only way
   to see what the page actually contained.

## Two failure modes that are not what they look like

**A strict-mode violation is usually the responsive layout, not a bug.** Cards
render their time twice (a desktop column and a mobile copy) and the day list
renders twice (the Dates sidebar and the mobile date strip). Match on a semantic
container, for example the `Dates` navigation landmark, rather than filtering by
`:visible`, which makes the assertion depend on the viewport.

**`redirect()` from a page under a `loading.tsx` is not an HTTP redirect.** The
shell streams first, the response commits as a 200, and the navigation is
delivered inside the stream for the browser to perform afterwards. Reading
`page.url()` at the load event sees the old URL. Poll for it. A redirect from a
layout (the `requireUser()` gate) runs before anything streams and genuinely is
a 307.

## Why the split

Reeve's bugs are integration bugs. Every defect found in the 2026-08-04 audit,
including two that silently destroyed user data, passed typecheck, lint and
build. None of them would have been caught by a unit test, because all of them
lived in the gap between application code and the database: a partial payload
nulling columns it never mentioned, a PostgREST embed that does not filter what
it looks like it filters, a foreign key pointing at the wrong day.

So the tests that matter run against a real Postgres with the real migrations
applied. Mocking the Supabase client would have passed on every one of those
bugs, which makes it worse than no test at all: a green suite that proves
nothing is a false sense of safety.

A real Supabase needs Docker. Matt does not run Docker, so integration tests
run in CI only, where GitHub's Ubuntu runners have it already. Branch
protection is what actually blocks a bad merge, so the tests still run at the
gate that matters. The cost is that a failing integration test cannot be
reproduced locally without installing Docker: read the CI log, or ask an agent
to reason about it from the failure output.

## What is actually mocked

Only the Next.js runtime, in `tests/integration/setup.ts`, because none of it
exists outside a request:

- `next/cache`, since `revalidatePath` throws outside a render
- `@/lib/supabase/server`, since `createClient` reads `cookies()`
- `@/lib/auth/helpers`, since `requireUser` redirects

**Import the test client from `./test-db`, never through `./setup`.** The client
and the mocked-user state live in `tests/integration/test-db.ts`, which imports
nothing from vitest, so Playwright's global setup can seed through `fixture.ts`
without pulling vitest into a plain Node process.

`setup.ts` re-exported the client for about an hour on 2026-08-05 and it broke
every mock silently. A setup file is transformed with the mock registry applied,
so a test importing the client through it got a different instance from the one
the mock factories close over, and `createClient()` quietly stopped returning
the test database. Nothing failed to compile. `tests/integration/setup-mocks.test.ts`
is the guard: four assertions that the four mocks are really in place. It needs
no database and fails in milliseconds.

Everything below that is real. The server action's own logic, PostgREST, SQL,
constraints and migrations all run for real. When a test fails, the failure is
about the product, not about a mock drifting from the thing it stands in for.

`setup.ts` also stubs `@/lib/redis` with a Proxy that resolves every call to
`null`, since none of the other integration tests need it and the singleton
would otherwise warn on every import. That stub cannot represent a held claim,
so `tests/integration/inbound-claim-redis.test.ts` (REE-32, Brief 38 Part 3)
calls `vi.unmock('@/lib/redis')` to opt out of it. That one test needs a real
Redis, so the integration job in `.github/workflows/ci.yml` runs one behind
Upstash's local-development REST shim (`serverless-redis-http`), because
`@upstash/redis` speaks Upstash's REST protocol rather than the Redis wire
protocol and cannot reach a bare Redis container directly.

## Fixtures

`tests/integration/fixture.ts` builds one account, one tour, one show day, one
show and one empty day sheet per test, then deletes the auth user afterwards.
That single delete cascades through every tour-scoped table, so teardown is one
line and cannot leave orphans behind.

Each test gets its own account, so one test cannot see another's rows and a
failure points at one test rather than at ordering. Integration tests run one
file at a time (`fileParallelism: false`) for the same reason: parallel writes
against one database produce failures that look like product bugs.

## Adding a test

Ask what a TM would do, then assert what they would see afterwards. The audit's
lesson was that every one of these bugs required someone to edit something and
then look somewhere else, which is exactly what a test is good at and what
reading code is bad at.

Prefer asserting the state of the row after the action to asserting that the
action returned no error. `updateDaySheet` returned `{ error: null }` the whole
time it was destroying catering.
