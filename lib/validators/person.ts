import { z } from 'zod'

export const personInsertSchema = z.object({
  tour_id: z.string().uuid(),
  person_type: z.enum(['artist', 'crew', 'management', 'support']),
  name: z.string().min(1),
  role: z.string().nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  preferred_channel: z.enum(['whatsapp', 'sms']).nullable().optional(),
  whatsapp_number: z.string().nullable().optional(),
  sms_number: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  dietary: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  home_city: z.string().nullable().optional(),
  passport_number: z.string().nullable().optional(),
  passport_expiry: z.string().nullable().optional(),
  passport_country: z.string().nullable().optional(),
  tshirt_size: z.string().nullable().optional(),
})

export const personUpdateSchema = personInsertSchema.partial()

export type PersonInsert = z.infer<typeof personInsertSchema>
export type PersonUpdate = z.infer<typeof personUpdateSchema>
