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
