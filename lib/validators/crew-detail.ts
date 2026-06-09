import { z } from 'zod'

export const crewDetailInsertSchema = z.object({
  person_id: z.string().uuid(),
  tour_id: z.string().uuid(),
  per_diem_rate: z.number().nonnegative().nullable().optional(),
  per_diem_currency: z.string().length(3).nullable().optional(),
  daily_wage_rate: z.number().nonnegative().nullable().optional(),
  wage_currency: z.string().length(3).nullable().optional(),
})

export const crewDetailUpdateSchema = crewDetailInsertSchema.partial()

export type CrewDetailInsert = z.infer<typeof crewDetailInsertSchema>
export type CrewDetailUpdate = z.infer<typeof crewDetailUpdateSchema>
