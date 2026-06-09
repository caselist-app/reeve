import { z } from 'zod'

export const documentShareInsertSchema = z.object({
  tour_id: z.string().uuid(),
  document_id: z.string().uuid(),
  recipient_person_id: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp', 'sms']),
  share_token: z.string().min(1),
  sent_at: z.string().nullable().optional(),
  opened_at: z.string().nullable().optional(),
  acknowledged_at: z.string().nullable().optional(),
})

// No owner update schema: document_shares state advances via service role only.
// The only insert is when a TM sends a document; reads are via the owner policy.

export type DocumentShareInsert = z.infer<typeof documentShareInsertSchema>
