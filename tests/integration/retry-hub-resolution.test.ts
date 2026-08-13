import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// resolve-hub is a Trigger.dev task and needs TRIGGER_SECRET_KEY plus a
// running Trigger.dev, neither of which exists here. Mocked the same way
// hub-resolve-inline.test.ts mocks it.
vi.mock('@/trigger/jobs/resolve-hub', () => ({
  resolveHubJob: { trigger: vi.fn() },
}))

import { resolveHubJob } from '@/trigger/jobs/resolve-hub'
import { retryHubResolution } from '@/lib/actions/shows'

// REE-216. A hub resolution that fails (a bad address, a geocode with no
// results, or a missing GOOGLE_MAPS_API_KEY in the Trigger.dev environment)
// throws inside the async job and writes nothing, so hub_resolved_at stays
// null forever and is indistinguishable from "still resolving". Nothing then
// retries it unless the TM happens to edit the address again. This is the
// retry affordance REE-214 named and left out of scope: re-enqueue the same
// job on demand.
describe('retryHubResolution', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
    vi.mocked(resolveHubJob.trigger).mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await destroyFixture(fixture)
  })

  it('re-enqueues the resolve-hub job for the show', async () => {
    const result = await retryHubResolution(fixture.showId)

    expect(result.error).toBeNull()
    expect(resolveHubJob.trigger).toHaveBeenCalledWith({ show_id: fixture.showId })
  })

  it('returns an error rather than triggering when the show does not exist', async () => {
    const result = await retryHubResolution('00000000-0000-0000-0000-000000000000')

    expect(result.error).toBe('Show not found.')
    expect(resolveHubJob.trigger).not.toHaveBeenCalled()
  })
})
