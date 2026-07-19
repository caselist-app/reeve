import { z } from 'zod'

// Action-facing schema: what the day sheet form sends to updateDaySheet.
// Accepts HH:MM time strings; the action combines them with show.date and
// tour.timezone before storing as timestamptz. show_id and tour_id are
// bound server-side and excluded here.
const optionalTime = z.string().nullable().optional()

export const daySheetFormSchema = z.object({
  venue_access: optionalTime,
  load_in: optionalTime,
  line_check: optionalTime,
  soundcheck: optionalTime,
  vip: optionalTime,
  doors: optionalTime,
  support_on: optionalTime,
  support_off: optionalTime,
  changeover: optionalTime,
  headliner_on: optionalTime,
  headliner_off: optionalTime,
  curfew: optionalTime,
  load_out: optionalTime,
  hotel_departure: optionalTime,
  // Catering fields: type selector plus meal time windows.
  catering_type: z.enum(['none', 'buyout', 'provided']).default('none'),
  catering_breakfast_start: optionalTime,
  catering_breakfast_end: optionalTime,
  catering_lunch_start: optionalTime,
  catering_lunch_end: optionalTime,
  catering_dinner_start: optionalTime,
  catering_dinner_end: optionalTime,
})

export type DaySheetForm = z.infer<typeof daySheetFormSchema>

const optionalTimestamp = z.string().nullable().optional()

export const daySheetInsertSchema = z.object({
  show_id: z.string().uuid(),
  tour_id: z.string().uuid(),
  venue_access: optionalTimestamp,
  load_in: optionalTimestamp,
  line_check: optionalTimestamp,
  soundcheck: optionalTimestamp,
  vip: optionalTimestamp,
  doors: optionalTimestamp,
  support_on: optionalTimestamp,
  support_off: optionalTimestamp,
  changeover: optionalTimestamp,
  headliner_on: optionalTimestamp,
  headliner_off: optionalTimestamp,
  curfew: optionalTimestamp,
  load_out: optionalTimestamp,
  hotel_departure: optionalTimestamp,
})

export const daySheetUpdateSchema = daySheetInsertSchema.partial()

export type DaySheetInsert = z.infer<typeof daySheetInsertSchema>
export type DaySheetUpdate = z.infer<typeof daySheetUpdateSchema>
