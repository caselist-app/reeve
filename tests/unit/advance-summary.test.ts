import { describe, it, expect } from 'vitest'
import { summarise } from '@/lib/schedule/advance-summary'

// The pure part of the day-info Advance block. REE-257, the same split as
// tests/unit/guest-list-summary.test.ts (REE-131): no component in this repo
// can be render-tested, so the row-to-department mapping and the error branch
// are pinned here against the function the fetch and the block both rely on.

describe('summarise', () => {
  // No show_advance row yet (nothing touched) is not a failed read: every
  // department defaults to not_started.
  it('defaults every department to not_started when there is no row', () => {
    expect(summarise(null, null)).toEqual({
      error: null,
      statuses: {
        audio: 'not_started',
        lighting: 'not_started',
        staging: 'not_started',
        hospitality: 'not_started',
        travel: 'not_started',
      },
    })
  })

  // A failed read is an error, never five confident, plausible, wrong statuses.
  it('returns the error shape on a query error, not the not-started defaults', () => {
    expect(summarise(null, { message: 'connection reset' })).toEqual({
      error: 'Could not load the advance.',
      statuses: {
        audio: 'not_started',
        lighting: 'not_started',
        staging: 'not_started',
        hospitality: 'not_started',
        travel: 'not_started',
      },
    })
  })

  // An error takes precedence even if a row happens to come back alongside it.
  it('returns the error shape even when a row is also present', () => {
    const row = {
      status_audio: 'done',
      status_lighting: 'done',
      status_staging: 'done',
      status_hospitality: 'done',
      status_travel: 'done',
    }

    expect(summarise(row, { message: 'timeout' }).error).toBe('Could not load the advance.')
  })

  // A row with a mix of statuses maps each column to its department, in
  // DEPARTMENT_LABELS order (audio, lighting, staging, hospitality, travel).
  it('maps a mixed row to the right five values', () => {
    const row = {
      status_audio: 'done',
      status_lighting: 'in_progress',
      status_staging: 'not_started',
      status_hospitality: 'done',
      status_travel: 'in_progress',
    }

    expect(summarise(row, null)).toEqual({
      error: null,
      statuses: {
        audio: 'done',
        lighting: 'in_progress',
        staging: 'not_started',
        hospitality: 'done',
        travel: 'in_progress',
      },
    })
  })
})
