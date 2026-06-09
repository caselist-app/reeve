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

// E.164: + followed by country code (1 digit, non-zero) and subscriber number (6-14 digits).
const e164Regex = /^\+[1-9]\d{6,14}$/

// Action-facing schema: what the person form sends to addPerson / updatePerson.
// tour_id is not here; it is passed as a separate argument to the action.
export const personSchema = z.object({
  person_type: z.enum(['artist', 'crew', 'management', 'support']),
  name: z.string().min(1, 'Name is required'),
  role: z.string().optional(),
  contact_email: z
    .union([z.string().email('Enter a valid email address'), z.literal('')])
    .optional(),
  contact_phone: z.string().optional(),
  preferred_channel: z.enum(['whatsapp', 'sms']).optional(),
  // Empty string is treated as no number; any non-empty value must be E.164.
  whatsapp_number: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().regex(e164Regex, 'Enter a number in E.164 format, e.g. +447700900123').optional()
  ),
  sms_number: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  dietary: z.string().optional(),
  allergies: z.string().optional(),
  home_city: z.string().optional(),
  passport_number: z.string().optional(),
  passport_expiry: z.string().optional(),
  passport_country: z.string().optional(),
  tshirt_size: z.string().optional(),
})

export const crewDetailSchema = z.object({
  per_diem_rate: z.number().positive().optional(),
  per_diem_currency: z.string().optional(),
  daily_wage_rate: z.number().positive().optional(),
  wage_currency: z.string().optional(),
})

export type Person = z.infer<typeof personSchema>
export type CrewDetail = z.infer<typeof crewDetailSchema>
