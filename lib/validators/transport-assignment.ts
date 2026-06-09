import { z } from 'zod'

export const transportAssignmentInsertSchema = z.object({
  tour_id: z.string().uuid(),
  segment_id: z.string().uuid(),
  person_id: z.string().uuid(),
  seat: z.string().nullable().optional(),
  baggage: z.string().nullable().optional(),
  meal_pref: z.string().nullable().optional(),
  frequent_flyer_no: z.string().nullable().optional(),
  known_traveller_no: z.string().nullable().optional(),
  ticket_reference: z.string().nullable().optional(),
  boarding_pass_document_id: z.string().uuid().nullable().optional(),
})

export const transportAssignmentUpdateSchema =
  transportAssignmentInsertSchema.partial()

export type TransportAssignmentInsert = z.infer<
  typeof transportAssignmentInsertSchema
>
export type TransportAssignmentUpdate = z.infer<
  typeof transportAssignmentUpdateSchema
>
