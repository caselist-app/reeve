# Tests

Two suites, split by whether they need a database.

```bash
pnpm test              # unit. Fast, no Docker, run these locally.
pnpm test:integration  # integration. Needs a running Supabase. CI runs these.
```

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

Everything below that is real. The server action's own logic, PostgREST, SQL,
constraints and migrations all run for real. When a test fails, the failure is
about the product, not about a mock drifting from the thing it stands in for.

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
