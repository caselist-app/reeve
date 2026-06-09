import { z } from 'zod'

export const attentionItemInsertSchema = z.object({
  tour_id: z.string().uuid(),
  kind: z.string().min(1),
  severity: z.number().int().min(1).max(5).optional(),
  title: z.string().min(1),
  detail: z.string().nullable().optional(),
  related_table: z.string().nullable().optional(),
  related_id: z.string().uuid().nullable().optional(),
  resolved_at: z.string().nullable().optional(),
})

export const attentionItemUpdateSchema = attentionItemInsertSchema.partial()

export type AttentionItemInsert = z.infer<typeof attentionItemInsertSchema>
export type AttentionItemUpdate = z.infer<typeof attentionItemUpdateSchema>
