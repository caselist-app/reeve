import { z } from 'zod'

// Action-facing schema: what the show form sends to createShow / updateShow.
// tour_id is bound server-side; it is not part of this schema.
export const showSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  venue_name: z.string().min(1, 'Venue name is required'),
  address: z.string().nullable().optional(),
  venue_type: z
    .enum(['club', 'theatre', 'arena', 'festival', 'outdoor', 'other'])
    .nullable()
    .optional(),
  capacity: z.number().int().positive().nullable().optional(),
  // Brief 36 step 3: load-in and curfew are day-sheet fields now, so they are
  // not part of what a show form submits. They go through daySheetFormSchema and
  // updateDaySheet, which is the only writer. Adding them back here would
  // recreate the two-columns-one-fact problem this brief removed.
  stage_dimensions: z.string().nullable().optional(),
  parking: z.string().nullable().optional(),
  shore_power: z.string().nullable().optional(),
  union_stage: z.boolean().nullable().optional(),
  stagehands: z.number().int().nonnegative().nullable().optional(),
  dressing_rooms: z.string().nullable().optional(),
  production_office: z.boolean().nullable().optional(),
  showers: z.boolean().nullable().optional(),
  house_pa_spec: z.string().nullable().optional(),
  house_lighting_plot: z.string().nullable().optional(),
})

export type Show = z.infer<typeof showSchema>
