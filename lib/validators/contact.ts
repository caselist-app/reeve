import { z } from 'zod'

// E.164: + followed by country code (1 non-zero digit) and 6-14 more digits.
const e164Regex = /^\+[1-9]\d{6,14}$/

// Form DTO for an account-level contact: the single source of truth for a
// person's identity. The default_* fields seed the per-tour terms when the
// contact is added to a tour; they are not the live tour value.
export const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_email: z
    .union([z.string().email('Enter a valid email address'), z.literal('')])
    .optional(),
  contact_phone: z.string().optional(),
  // Nullable: a brand-new contact with no WhatsApp number and no Telegram
  // link yet has no operational channel, a real state, not an error.
  operational_channel: z.enum(['whatsapp', 'telegram']).nullable().optional(),
  // Independent of the operational channel: email serves a different purpose
  // (formal riders and advancing documents), not the day-to-day stream.
  email_enabled: z.boolean().optional(),
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
  passport_first_names: z.string().optional(),
  passport_surname: z.string().optional(),
  date_of_birth: z.string().optional(),
  tshirt_size: z.string().optional(),
  default_person_type: z.enum(['artist', 'crew', 'management', 'support']).optional(),
  default_role: z.string().optional(),
  default_per_diem_rate: z.number().nonnegative().optional(),
  default_per_diem_currency: z.string().optional(),
  default_daily_wage_rate: z.number().nonnegative().optional(),
  default_wage_currency: z.string().optional(),
  notes: z.string().optional(),
})

export type ContactForm = z.infer<typeof contactSchema>
