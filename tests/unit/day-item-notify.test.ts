import { describe, it, expect } from 'vitest'
import { resolveNotifyOffer } from '@/lib/schedule/day-item-notify'

// REE-96. A load-in typed through the add flow has a null show_id (Brief 42
// gave every typed item that column, but nothing writes it), so gating the
// notify offer on item.show_id offered nothing for anything typed since. The
// gate is on dayShowId, resolved by the caller from tour_date_id, not on the
// item's own column: these pin that a typed item's day still offers to notify
// crew when it has a show, and that a dayless day still offers nothing.

describe('resolveNotifyOffer', () => {
  it('offers a notify for a moved load-in on a show day, even with no show_id on the item itself', () => {
    const offer = resolveNotifyOffer('load_in', 'show-1', '15:00', '14:00')
    expect(offer).toEqual({
      change: { type: 'show', showId: 'show-1', field: 'load_in' },
      previousValue: '14:00',
    })
  })

  it('offers a notify for a moved curfew on a show day', () => {
    const offer = resolveNotifyOffer('curfew', 'show-1', '23:30', '23:00')
    expect(offer).toEqual({
      change: { type: 'show', showId: 'show-1', field: 'curfew' },
      previousValue: '23:00',
    })
  })

  it('offers nothing when the day has no show', () => {
    expect(resolveNotifyOffer('load_in', null, '15:00', '14:00')).toBeNull()
  })

  it('offers nothing for a kind that is not load_in or curfew, even on a show day', () => {
    expect(resolveNotifyOffer('soundcheck', 'show-1', '15:00', '14:00')).toBeNull()
  })

  it('offers nothing when the time did not change', () => {
    expect(resolveNotifyOffer('load_in', 'show-1', '14:00', '14:00')).toBeNull()
  })

  it('reports a null previous value for a first-time entry rather than "was TBC"', () => {
    const offer = resolveNotifyOffer('load_in', 'show-1', '15:00', '')
    expect(offer?.previousValue).toBeNull()
  })

  it('treats an undefined-turned-empty start as unchanged from an empty saved value', () => {
    expect(resolveNotifyOffer('load_in', 'show-1', null, '')).toBeNull()
  })
})
