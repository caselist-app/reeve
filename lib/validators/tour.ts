import { z } from 'zod'

export const tourInsertSchema = z.object({
  account_id: z.string().uuid(),
  name: z.string().min(1),
  artist_act: z.string().min(1),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  territory: z.string().nullable().optional(),
  status: z.enum(['planning', 'active', 'completed', 'archived']).optional(),
  base_currency: z.string().length(3).optional(),
  artist_slug: z.string().nullable().optional(),
})

export const tourUpdateSchema = tourInsertSchema.partial()

export type TourInsert = z.infer<typeof tourInsertSchema>
export type TourUpdate = z.infer<typeof tourUpdateSchema>

// Action-facing schema: what the tour form sends to createTourAction / updateTourAction.
// account_id and status are set server-side; they are not part of this schema.
export const tourSchema = z.object({
  name: z.string().min(1, 'Tour name is required'),
  artist_act: z.string().min(1, 'Artist / act name is required'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  territory: z.string().optional(),
  base_currency: z.string().length(3).default('GBP'),
  artist_slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens')
    .optional(),
})

export type Tour = z.infer<typeof tourSchema>
