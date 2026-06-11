import { z } from 'zod'

export const dayEventSchema = z.object({
  tour_id:   z.string().uuid(),
  date:      z.string().min(1, 'Date is required'),
  title:     z.string().min(1, 'Title is required'),
  starts_at: z.string().nullable().optional(),
  ends_at:   z.string().nullable().optional(),
  location:  z.string().nullable().optional(),
  notes:     z.string().nullable().optional(),
  show_id:   z.string().uuid().nullable().optional(),
})

export const dayEventUpdateSchema = dayEventSchema.partial().omit({ tour_id: true })

export type DayEvent = z.infer<typeof dayEventSchema>
export type DayEventUpdate = z.infer<typeof dayEventUpdateSchema>
