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
  // Brief 42: catering_type moved from day_sheets to shows in REE-19, because it
  // is the one column on that table that was not a time and had no row to
  // become. It is per-show ("who is providing catering"), so it belongs to the
  // show form, and the meal windows that used to sit beside it are catering
  // items on the day now.
  //
  // Optional but NOT nullable: the column is `not null default 'none'`, so a
  // caller that does not mention it leaves it alone, and one that submits null
  // would be asking for a constraint violation. No .default() here either: a
  // default on this exact field is what invented 'none' for a form that never
  // sent it and wiped six catering columns on every load-in edit.
  catering_type: z.enum(['none', 'buyout', 'provided']).optional(),
  // Brief 36 step 3: load-in and curfew are day-sheet fields now, so they are
  // not part of what a show form submits. Brief 42 made them day_items rows,
  // written by lib/actions/day-items.ts, which is the only writer. Adding them
  // back here would recreate the two-columns-one-fact problem those briefs
  // removed.
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
