import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createE2eSeed } from '../integration/fixture'
import { SEED_PATH } from './seed'

// Builds the two accounts the whole suite runs against, once, before any spec.
// Reuses tests/integration/fixture.ts rather than forking it: the shape is the
// same, and a second copy of the seeding logic would drift from the schema at
// its own pace.
//
// Anything that goes wrong here throws, which fails the run before a single
// spec has been reported. That is deliberate: a suite that seeds badly and then
// runs produces failures about pages, when the fault is in the fixture.
export default async function globalSetup() {
  const seed = await createE2eSeed()

  mkdirSync(dirname(SEED_PATH), { recursive: true })
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2))

  console.log(`Seeded account A (${seed.a.email}) and account B (${seed.b.email}).`)
}
