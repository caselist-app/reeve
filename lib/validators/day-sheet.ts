import { z } from 'zod'

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
