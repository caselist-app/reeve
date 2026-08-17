import type { ChangeDescriptor } from '@/lib/comms/affected'

// Which kinds are worth offering to tell crew about when they move. A
// load-in affects everyone travelling to the venue that day, and a curfew
// affects transport home.
//
// Ordered, so a save that moves both offers one message rather than two, and
// load_in wins because it reaches more people.
export const NOTIFY_KINDS = ['load_in', 'curfew'] as const

export type NotifyOffer = {
  change: Extract<ChangeDescriptor, { type: 'show' }>
  previousValue: string | null
}

/**
 * Whether a day item's time save should offer to tell crew, and what to
 * offer.
 *
 * Gated on dayShowId, the show on the item's day resolved from tour_date_id
 * by the caller, not on the item's own show_id column: that column is null
 * for anything typed through the add flow since Brief 42, show day or not, so
 * gating on it offered nothing for a typed item (REE-96). A day with no show
 * has no show to hang a change alert off, and the alert's descriptor is keyed
 * by show, so nothing is offered there either.
 */
export function resolveNotifyOffer(
  kind: string,
  dayShowId: string | null,
  start: string | null,
  savedStart: string,
): NotifyOffer | null {
  const isNotifiable = (NOTIFY_KINDS as readonly string[]).includes(kind)
  if (!isNotifiable || !dayShowId || (start ?? '') === savedStart) return null

  return {
    change: {
      type: 'show',
      showId: dayShowId,
      field: kind === 'load_in' ? 'load_in' : 'curfew',
    },
    // Null when there was nothing there before: an initial entry is not a
    // change to anything, and "was TBC" reads worse than saying nothing.
    previousValue: savedStart || null,
  }
}
