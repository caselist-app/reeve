import { firstItemOfKind } from '@/lib/schedule/day-items'
import type { DayItem } from '@/lib/schedule/day-items'
import type { DayBlockInput } from '@/lib/comms/blocks/select'

// A show's items collapsed to one value per kind, for the WhatsApp day blocks.
// Brief 42, REE-20.
//
// THIS LOOKS LIKE PUTTING THE COLUMNS BACK AND IT IS NOT, so it is worth being
// clear about where the boundary is.
//
// A Meta message template has fixed placeholders. The show-information template
// has a slot for load-in, a slot for soundcheck, a slot for the changeover and a
// slot for the show, and there is no template with two soundchecks because Meta
// approves templates one at a time and a variable-length one does not exist.
// Something therefore has to choose one soundcheck, and doing it here makes that
// choice visible in one function rather than spread through the selector and
// three renderers.
//
// The collapse is forced by the channel, not by the storage. Nothing else reads
// this shape: /itinerary renders every item, and so does the day view. A surface
// that CAN show a list should call fetchShowItems and render it.
//
// First rather than last, because the items arrive in running order and crew are
// on site for the first load-in. A second soundcheck is simply not in the
// template, and that is a WhatsApp limitation to fix by adding a template, not
// by changing what Reeve stores.

// Everything the day blocks read. A superset of DayBlockInput: the selector
// only needs the starts to decide which template fires, and the renderers need
// the catering ends as well, because a meal window is the one place a range is
// the point.
export type ShowBlockTimes = DayBlockInput & {
  catering_breakfast_end: string | null
  catering_lunch_end: string | null
  catering_dinner_end: string | null
}

/**
 * A show's items in the shape the day blocks read.
 *
 * `cateringType` is a parameter rather than an item because it moved to `shows`
 * in REE-19: it is the one thing on the old day sheet that was not a time and
 * had no row to become.
 */
export function showBlockTimesFromItems(
  items: DayItem[],
  cateringType: string,
): ShowBlockTimes {
  const at = (kind: string) => firstItemOfKind(items, kind)?.starts_at ?? null
  const until = (kind: string) => firstItemOfKind(items, kind)?.ends_at ?? null

  return {
    load_in: at('load_in'),
    soundcheck: at('soundcheck'),
    changeover: at('changeover'),
    // The headliner set is one windowed item now (REE-100). Its start is the
    // on-stage time the "Show" slot has always carried; the off time lives in
    // the item's ends_at and is not one of the fixed template placeholders.
    headliner_on: at('headliner'),
    curfew: at('curfew'),
    catering_type: cateringType,
    catering_breakfast_start: at('catering_breakfast'),
    catering_breakfast_end: until('catering_breakfast'),
    catering_lunch_start: at('catering_lunch'),
    catering_lunch_end: until('catering_lunch'),
    catering_dinner_start: at('catering_dinner'),
    catering_dinner_end: until('catering_dinner'),
  }
}
