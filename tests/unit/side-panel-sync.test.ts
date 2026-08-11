import { describe, it, expect } from 'vitest'
import { patchScheduleItemTimes, type PanelDescriptor } from '@/stores/side-panel-store'

// REE-85. Resizing a block on the grid persists a new end, but the detail panel
// holds a snapshot captured when the block was clicked, so without this patch it
// keeps showing the stale time and a Save from that stale form writes the empty
// end back over the one the resize just added. The patch is the pure core of the
// fix; this pins the four cases day-calendar.tsx relies on.

const DAY_ITEM_PANEL: Extract<PanelDescriptor, { type: 'day-item' }> = {
  type: 'day-item',
  key: 'day_item:abc',
  tourId: 'tour-1',
  timezone: 'Europe/London',
  item: {
    id: 'abc',
    show_id: null,
    kind: 'catering_breakfast',
    title: 'Breakfast',
    starts_at: '2026-08-31T05:00:00.000Z',
    ends_at: null,
    location: null,
    notes: null,
  },
}

const TRANSPORT_PANEL: Extract<PanelDescriptor, { type: 'transport' }> = {
  type: 'transport',
  key: 'segment:xyz',
  timezone: 'Europe/London',
  segment: {
    id: 'xyz',
    mode: 'flight',
    origin: 'LHR',
    destination: 'CDG',
    depart_at: '2026-08-31T09:00:00.000Z',
    arrive_at: null,
    carrier_operator: null,
    vehicle_or_flight_no: null,
    booking_reference: null,
    status: 'planned',
    origin_iata: null,
    destination_iata: null,
    flight_status: null,
    actual_depart_at: null,
    actual_arrive_at: null,
    gate: null,
    terminal: null,
    last_tracked_at: null,
  },
}

describe('patchScheduleItemTimes', () => {
  it('writes the resized end onto an open day-item panel with no end before', () => {
    const next = patchScheduleItemTimes(
      DAY_ITEM_PANEL,
      'day_item:abc',
      '2026-08-31T05:00:00.000Z',
      '2026-08-31T05:45:00.000Z',
    )
    expect(next).not.toBeNull()
    expect(next?.type).toBe('day-item')
    if (next?.type === 'day-item') {
      expect(next.item.starts_at).toBe('2026-08-31T05:00:00.000Z')
      expect(next.item.ends_at).toBe('2026-08-31T05:45:00.000Z')
    }
  })

  it('preserves a null end from a pure move, matching what the write path stored', () => {
    const next = patchScheduleItemTimes(
      DAY_ITEM_PANEL,
      'day_item:abc',
      '2026-08-31T06:00:00.000Z',
      null,
    )
    expect(next?.type === 'day-item' && next.item.ends_at).toBeNull()
    expect(next?.type === 'day-item' && next.item.starts_at).toBe('2026-08-31T06:00:00.000Z')
  })

  it('rewrites depart_at and arrive_at on an open transport panel', () => {
    const next = patchScheduleItemTimes(
      TRANSPORT_PANEL,
      'segment:xyz',
      '2026-08-31T09:00:00.000Z',
      '2026-08-31T11:30:00.000Z',
    )
    expect(next?.type).toBe('transport')
    if (next?.type === 'transport') {
      expect(next.segment.depart_at).toBe('2026-08-31T09:00:00.000Z')
      expect(next.segment.arrive_at).toBe('2026-08-31T11:30:00.000Z')
    }
  })

  it('does not carry the same object identity, so the store repaints', () => {
    const next = patchScheduleItemTimes(
      DAY_ITEM_PANEL,
      'day_item:abc',
      '2026-08-31T05:00:00.000Z',
      '2026-08-31T05:45:00.000Z',
    )
    expect(next).not.toBe(DAY_ITEM_PANEL)
    if (next?.type === 'day-item') expect(next.item).not.toBe(DAY_ITEM_PANEL.item)
  })

  it('no-ops when the open panel is a different record', () => {
    expect(
      patchScheduleItemTimes(DAY_ITEM_PANEL, 'day_item:other', '2026-08-31T05:00:00.000Z', null),
    ).toBeNull()
  })

  it('no-ops when the open panel is not a schedule detail panel', () => {
    const addDay: PanelDescriptor = { type: 'add-day', tourId: 'tour-1' }
    expect(patchScheduleItemTimes(addDay, 'day_item:abc', '2026-08-31T05:00:00.000Z', null)).toBeNull()
  })

  it('no-ops on a closed panel (null)', () => {
    expect(patchScheduleItemTimes(null, 'day_item:abc', '2026-08-31T05:00:00.000Z', null)).toBeNull()
  })
})
