import { z } from 'zod'

// E.164: + followed by country code (1 non-zero digit) and 6-14 more digits.
const e164Regex = /^\+[1-9]\d{6,14}$/

// Form DTO for adding or editing a tour member. It carries both the person's
// identity (name, passport, dietary, channels) and their terms on this tour
// (person_type, role). The people action splits the write: identity is persisted
// to the account-level contact (the single source of truth), the membership
// (person_type, role) to people. See lib/actions/people.ts. tour_id is not here;
// it is passed as a separate argument to the action.
export const personSchema = z.object({
  person_type: z.enum(['artist', 'crew', 'management', 'support']),
  name: z.string().min(1, 'Name is required'),
  role: z.string().optional(),
  contact_email: z
    .union([z.string().email('Enter a valid email address'), z.literal('')])
    .optional(),
  contact_phone: z.string().optional(),
  preferred_channel: z.enum(['whatsapp', 'email', 'both']).optional(),
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
  passport_first_names: z.string().optional(),
  passport_surname: z.string().optional(),
  passport_number: z.string().optional(),
  passport_expiry: z.string().optional(),
  passport_country: z.string().optional(),
  date_of_birth: z.string().optional(),
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
