import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// resolve-hub is a Trigger.dev task. createShow awaits resolveHubJob.trigger(),
// which needs TRIGGER_SECRET_KEY and a running Trigger.dev, neither of which
// exists here. Mock the trigger so the action reaches the revalidate line
// instead of throwing on the enqueue. This is also why the show add path has no
// e2e coverage: the same dependency fails a UI-driven show in CI, so this
// action-level test is the only automated home for the REE-66 guard.
vi.mock('@/trigger/jobs/resolve-hub', () => ({
  resolveHubJob: { trigger: vi.fn() },
}))

import { createShow } from '@/lib/actions/shows'

// REE-66. A show is the one add-day path whose server action does not revalidate
// the schedule route. Every other path (createTourDate, createRehearsal) does,
// and check:conventions Rule 2 enforces it, but it greps for a
// .from(table).insert()-style write and createShow writes through the
// create_show_with_dependents RPC, which the grep cannot see. So the omission
// was invisible to every gate. A new show therefore relied entirely on the
// add-day panel's client router.refresh() to appear in the @secondaryPanel Dates
// sidebar, with nothing server-side to back it up.
//
// The RPC gates on owns_tour(), so it cannot run under the service-role test
// client (fixture.ts bypasses it for the same reason). The RPC is stubbed here:
// what is under test is that createShow revalidates the schedule route after a
// successful create, not the RPC's own behaviour. The ownership select above it
// runs against the real fixture tour, so the auth gate is exercised for real.
describe('createShow revalidates the schedule route', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
    vi.mocked(revalidatePath).mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await destroyFixture(fixture)
  })

  it('calls revalidatePath on /tours/{id}/schedule after creating a show', async () => {
    const rpcSpy = vi
      .spyOn(testDb, 'rpc')
      // The RPC returns the new show id as a bare scalar; shape only matters
      // insofar as createShow reads { data, error }.
      .mockResolvedValue({ data: 'show-from-rpc', error: null } as never)

    const result = await createShow(fixture.tourId, {
      date: '2030-09-01',
      venue_name: 'Repro Venue',
    })

    // The action succeeded, so the revalidate below is on the success path and
    // not skipped by an early error return.
    expect(result.error).toBeNull()
    expect(result.showId).toBe('show-from-rpc')
    expect(rpcSpy).toHaveBeenCalledWith(
      'create_show_with_dependents',
      expect.objectContaining({ p_tour_id: fixture.tourId }),
    )

    // The whole point of REE-66. If this line is removed from createShow, a new
    // show sits out of the Dates sidebar until a hard reload, and this goes red.
    expect(revalidatePath).toHaveBeenCalledWith(`/tours/${fixture.tourId}/schedule`)
  })
})
