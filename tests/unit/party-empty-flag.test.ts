import { describe, it, expect } from 'vitest'
import { emptyPartyIds } from '@/lib/party/empty-flag'
import { extractionPartySchema } from '@/lib/validators/extraction'

// REE-170. The day view flags a segment or stay with zero attached people, for
// every transport mode including truck, and never blocks a save on it.

describe('emptyPartyIds', () => {
  it('flags a truck segment with zero people', () => {
    const flagged = emptyPartyIds(['truck-1'], [])
    expect(flagged.has('truck-1')).toBe(true)
  })

  it('does not flag a segment of any mode with at least one person', () => {
    // The set carries no notion of mode at all: that is what proves a truck is
    // never quietly exempted the way a vehicle-only reading of "party" might
    // suggest it should be.
    for (const id of ['flight-1', 'rail-1', 'bus-1', 'truck-1', 'ground-1', 'hire-1']) {
      expect(emptyPartyIds([id], [id]).has(id)).toBe(false)
    }
  })

  it('flags a hotel stay with zero attached people the same way', () => {
    const flagged = emptyPartyIds(['stay-1'], [])
    expect(flagged.has('stay-1')).toBe(true)
  })

  it('ignores an assignment for an id outside the set being checked', () => {
    // A cross-day roster leak (an assignment row for an id this day never
    // asked about) must never mark that id as having people when it was not
    // one of the ids under consideration.
    const flagged = emptyPartyIds(['seg-1', 'seg-2'], ['seg-2', 'someone-elses-id'])
    expect(Array.from(flagged)).toEqual(['seg-1'])
  })

  it('flags nothing when every id has at least one person', () => {
    expect(emptyPartyIds(['a', 'b'], ['a', 'b']).size).toBe(0)
  })

  it('flags nothing for an empty id list', () => {
    expect(emptyPartyIds([], []).size).toBe(0)
  })
})

describe('transport and hotel party schemas never require at least one person', () => {
  // The flag is display-only and must never block a save. A .min(1) on either
  // schema's people field would do exactly that, so these assert the empty
  // list parses cleanly rather than merely checking the schema by inspection.
  it('accepts an empty people array for a transport_segment party selection', () => {
    expect(() =>
      extractionPartySchema.parse({ transport_segments: { '0': { people: [] } } }),
    ).not.toThrow()
  })

  it('accepts an empty people array for a hotel_stay party selection', () => {
    expect(() =>
      extractionPartySchema.parse({ hotel_stays: { '0': { people: [] } } }),
    ).not.toThrow()
  })

  it('accepts no party selection at all for either entity', () => {
    expect(() => extractionPartySchema.parse({})).not.toThrow()
  })
})
