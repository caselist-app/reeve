import { z } from 'zod'
import { DAY_ITEM_KIND_NAMES } from '@/lib/schedule/day-item-kinds'

// Action-facing schema for a day item. Brief 42, REE-18.
//
// TIMES ARRIVE AS WALL CLOCK, NOT AS INSTANTS, and that is the one contract
// decision in this file worth reading twice.
//
// A day item's stored instant depends on the rest of the day. A curfew of 01:30
// belongs to the morning after the show, and the only way to know that is to
// look at the day's other items and see the clock go backwards past the latest
// daytime time. That is Brief 40's rule, it lives in resolveItemDayOffsets, and
// it needs the whole day. A caller holding one line of typed text does not have
// the whole day, so it cannot build the instant.
//
// So the boundary is: callers send HH:MM in the tour's timezone, the action
// resolves the roll-over across the day and converts. Exactly where
// updateDaySheet put it, for exactly the same reason.
//
// NOTE FOR REE-21. The brief has parseDayItem returning `startsAt`/`endsAt` as
// instants. Returning HH:MM instead is simpler and is what this action wants: a
// pure parser cannot see the day, so an instant it builds would be on the wrong
// date for every crossing kind, and the day form would have to convert it back
// to a clock to hand it here. Decide it there; this file is why.
//
// No .default() on anything, and check:conventions fails the build if one
// appears. catering_type carrying one is what silently wiped six columns every
// time a TM edited a load-in.

// HH:MM, 24 hour. Deliberately strict: a time input posts this shape, and
// anything else reaching here means a caller built the string by hand and is
// about to store a wrong instant rather than an obviously broken one.
const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const clockField = z
  .string()
  .regex(CLOCK_PATTERN, 'Time must be a 24 hour HH:MM, for example 14:00.')
  .nullable()
  .optional()

// Read off the one list rather than restated, so this cannot drift from the
// database's check constraint. Rule 10 in scripts/check-conventions.mjs already
// ties that list to the migration, so all three agree by construction.
//
// A refine rather than z.enum: z.enum needs a non-empty tuple type and
// DAY_ITEM_KIND_NAMES is a readonly string[], so using it would mean a cast.
// A cast here would be an assertion that the list is non-empty, which is the
// kind of thing that is true until someone edits the list.
const kindField = z
  .string()
  .refine((k) => DAY_ITEM_KIND_NAMES.includes(k), {
    message: 'That is not something Reeve knows how to put on a day.',
  })

// Trimmed, because ' ' is not a title and the database's other_needs_title
// constraint would happily accept it. Empty after trimming reads as cleared.
const textField = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional()

// The shape only. Every cross-field rule (an end with no start, an untitled
// custom item) is checked in the action instead, against the stored row merged
// with the payload. An update can submit an end without mentioning the start it
// already has, so a rule enforced on the payload alone would reject a save that
// is perfectly valid.
const dayItemBase = z.object({
  tour_id: z.string().uuid(),
  tour_date_id: z.string().uuid(),
  show_id: z.string().uuid().nullable().optional(),
  kind: kindField,
  title: textField,
  start_clock: clockField,
  end_clock: clockField,
  location: textField,
  notes: textField,
})

export const dayItemSchema = dayItemBase

// tour_id and tour_date_id are omitted rather than made optional. Moving an item
// to another day is a real thing a TM will want, and it is not this issue: doing
// it properly means re-resolving the roll-over on both the day it left and the
// day it joined, and there is no surface that asks for it yet. Leaving them
// settable but unhandled would let a caller move an item and silently keep the
// instant it had on the old day.
export const dayItemUpdateSchema = dayItemBase
  .partial()
  .omit({ tour_id: true, tour_date_id: true })

export type DayItemForm = z.infer<typeof dayItemSchema>
export type DayItemUpdateForm = z.infer<typeof dayItemUpdateSchema>
