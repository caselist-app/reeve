import { z } from 'zod'

export const accountInsertSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  default_home: z.enum(['tm', 'pm']).optional(),
  stripe_customer_id: z.string().nullable().optional(),
  subscription_status: z
    .enum(['trialing', 'active', 'past_due', 'canceled'])
    .optional(),
})

export const accountUpdateSchema = accountInsertSchema.partial()

export type AccountInsert = z.infer<typeof accountInsertSchema>
export type AccountUpdate = z.infer<typeof accountUpdateSchema>
