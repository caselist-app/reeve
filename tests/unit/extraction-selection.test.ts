import { describe, it, expect } from 'vitest'
import { narrowExtractionProposal } from '@/lib/validators/extraction'
import type { ExtractionProposal } from '@/lib/ai/extract'

// REE-154: the pure narrowing function behind confirmExtraction's keep
// argument. No I/O, so every case here is a plain input/output check.

const PROPOSAL: ExtractionProposal = {
  shows: [
    { date: '2026-09-01', venue_name: 'The Fillmore', address: null, load_in: null, curfew: null },
    { date: '2026-09-02', venue_name: 'The Wiltern', address: null, load_in: null, curfew: null },
    { date: '2026-09-03', venue_name: 'The Fonda', address: null, load_in: null, curfew: null },
  ],
  transport_segments: [
    {
      mode: 'flight',
      origin: 'LAX',
      destination: 'SFO',
      depart_at: null,
      arrive_at: null,
      carrier_operator: null,
      vehicle_or_flight_no: null,
      booking_reference: null,
    },
  ],
  hotel_stays: [
    {
      name: 'Ace Hotel',
      city: 'Los Angeles',
      address: null,
      check_in_date: null,
      check_out_date: null,
      check_in_time: null,
      check_out_time: null,
      confirmation_number: null,
    },
  ],
}

describe('narrowExtractionProposal', () => {
  it('keeping one of three shows writes one show', () => {
    const result = narrowExtractionProposal(PROPOSAL, {
      shows: [1],
      transport_segments: [],
      hotel_stays: [],
    })

    expect(result.error).toBeNull()
    expect(result.proposal?.shows).toEqual([PROPOSAL.shows[1]])
    expect(result.proposal?.transport_segments).toEqual([])
    expect(result.proposal?.hotel_stays).toEqual([])
  })

  it('keeping nothing across all three arrays yields an empty proposal', () => {
    const result = narrowExtractionProposal(PROPOSAL, {
      shows: [],
      transport_segments: [],
      hotel_stays: [],
    })

    expect(result.error).toBeNull()
    expect(result.proposal).toEqual({ shows: [], transport_segments: [], hotel_stays: [] })
  })

  it('an index outside the array is rejected rather than silently ignored', () => {
    const result = narrowExtractionProposal(PROPOSAL, {
      shows: [3],
      transport_segments: [],
      hotel_stays: [],
    })

    expect(result.proposal).toBeNull()
    expect(result.error).toContain('shows')
  })

  it('rejects a negative index the same way', () => {
    const result = narrowExtractionProposal(PROPOSAL, {
      shows: [],
      transport_segments: [-1],
      hotel_stays: [],
    })

    expect(result.proposal).toBeNull()
    expect(result.error).toContain('transport_segments')
  })

  it('keeping every row round-trips the full proposal', () => {
    const result = narrowExtractionProposal(PROPOSAL, {
      shows: [0, 1, 2],
      transport_segments: [0],
      hotel_stays: [0],
    })

    expect(result.error).toBeNull()
    expect(result.proposal).toEqual(PROPOSAL)
  })
})
