import { existsSync, readFileSync } from 'node:fs'
import type { E2eSeed } from '../integration/fixture'

// Where globalSetup leaves the ids it created, and where auth.setup.ts leaves
// the session it minted.
//
// Both live under playwright/.auth rather than under the project outputDir,
// which is what the brief suggested. Playwright empties outputDir at the start
// of a test run, after globalSetup has already written to it, so a seed file
// there is deleted before the first spec can read it. playwright/.auth is
// already gitignored for the storage state, which is a real session cookie and
// never belongs in the repo.
export const SEED_PATH = 'playwright/.auth/seed.json'
export const STORAGE_STATE_PATH = 'playwright/.auth/account-a.json'

export function readSeed(): E2eSeed {
  if (!existsSync(SEED_PATH)) {
    // Thrown, not defaulted. A spec that quietly carried on with an empty seed
    // would visit /tours/undefined, get a 404, and report it as a page that
    // does not render, which is a failure pointing at the wrong thing.
    throw new Error(
      `No seed at ${SEED_PATH}. globalSetup writes it, so this means the seed ` +
        `failed or the suite was started without it.`
    )
  }

  return JSON.parse(readFileSync(SEED_PATH, 'utf8')) as E2eSeed
}
