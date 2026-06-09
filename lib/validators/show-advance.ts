import { z } from 'zod'

const advanceStatus = z.enum(['not_started', 'in_progress', 'done'])

export const showAdvanceInsertSchema = z.object({
  show_id: z.string().uuid(),
  tour_id: z.string().uuid(),
  status_audio: advanceStatus.optional(),
  status_lighting: advanceStatus.optional(),
  status_staging: advanceStatus.optional(),
  status_hospitality: advanceStatus.optional(),
  status_travel: advanceStatus.optional(),
})

export const showAdvanceUpdateSchema = showAdvanceInsertSchema.partial()

export type ShowAdvanceInsert = z.infer<typeof showAdvanceInsertSchema>
export type ShowAdvanceUpdate = z.infer<typeof showAdvanceUpdateSchema>
