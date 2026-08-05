import { existsSync, rmSync } from 'node:fs'
import { destroyE2eSeed } from '../integration/fixture'
import { readSeed, SEED_PATH, STORAGE_STATE_PATH } from './seed'

// Deleting the two auth users cascades through accounts, tours and every
// tour-scoped table, so this is the whole teardown. Same one-line reasoning as
// destroyFixture.
//
// Runs on a CI runner whose database is thrown away seconds later, so this is
// about the local case and about not leaving a stale seed file that a later run
// would read as if it were current.
export default async function globalTeardown() {
  if (!existsSync(SEED_PATH)) return

  try {
    await destroyE2eSeed(readSeed())
  } finally {
    rmSync(SEED_PATH, { force: true })
    rmSync(STORAGE_STATE_PATH, { force: true })
  }
}
