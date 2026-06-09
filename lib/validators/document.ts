import { z } from 'zod'

export const documentInsertSchema = z.object({
  tour_id: z.string().uuid(),
  doc_type: z.string().min(1),
  title: z.string().min(1),
  storage_path: z.string().min(1),
  version: z.number().int().positive().optional(),
  is_current: z.boolean().optional(),
})

export const documentUpdateSchema = documentInsertSchema.partial()

export type DocumentInsert = z.infer<typeof documentInsertSchema>
export type DocumentUpdate = z.infer<typeof documentUpdateSchema>
