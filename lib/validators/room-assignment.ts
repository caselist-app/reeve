import { z } from 'zod'

export const roomAssignmentInsertSchema = z.object({
  tour_id: z.string().uuid(),
  hotel_stay_id: z.string().uuid(),
  person_id: z.string().uuid(),
  room_tier: z.enum(['artist', 'crew']),
  room_type: z.string().nullable().optional(),
  sharing_with: z.string().uuid().nullable().optional(),
})

export const roomAssignmentUpdateSchema = roomAssignmentInsertSchema.partial()

export type RoomAssignmentInsert = z.infer<typeof roomAssignmentInsertSchema>
export type RoomAssignmentUpdate = z.infer<typeof roomAssignmentUpdateSchema>
