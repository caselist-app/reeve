import { z } from 'zod'

// E.164: + followed by country code (1 non-zero digit) and 6-14 more digits.
const e164Regex = /^\+[1-9]\d{6,14}$/

// Form DTO for an account-level contact: the single source of truth for a
// person's identity. The default_* fields seed the per-tour terms when the
// contact is added to a tour; they are not the live tour value.
//
// Every optional field is `.nullable().optional()` on purpose, and the two are
// not the same thing here. `.optional()` admits undefined, which readForm
// produces for a field the rendered form has no input for, and which toRow
// drops so the stored value survives. `.nullable()` admits null, which readForm
// produces for an input the TM emptied, and which toRow writes. Dropping either
// half collapses the two states back together, which is the bug this schema was
// rewritten for (Brief 37). No field here carries `.default()`: a default
// invents a value for a key nobody submitted, which is the same wipe by a
// shorter route, and scripts/check-conventions.mjs now fails the build for one.
const optionalText = z.string().nullable().optional()

export const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  // No empty-string branch. An emptied input arrives as null now, and a third
  // state that means the same thing as null is how a convention rots.
  contact_email: z.string().email('Enter a valid email address').nullable().optional(),
  contact_phone: optionalText,
  // Nullable: a brand-new contact with no WhatsApp number and no Telegram
  // link yet has no operational channel, a real state, not an error.
  operational_channel: z.enum(['whatsapp', 'telegram']).nullable().optional(),
  // Independent of the operational channel: email serves a different purpose
  // (formal riders and advancing documents), not the day-to-day stream.
  email_enabled: z.boolean().optional(),
  // An emptied input arrives as null and clears the stored number. Only a
  // non-empty value has to be E.164.
  whatsapp_number: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().regex(e164Regex, 'Enter a number in E.164 format, e.g. +447700900123').nullable().optional()
  ),
  sms_number: optionalText,
  emergency_contact_name: optionalText,
  emergency_contact_phone: optionalText,
  dietary: optionalText,
  allergies: optionalText,
  home_city: optionalText,
  passport_number: optionalText,
  passport_expiry: optionalText,
  passport_country: optionalText,
  passport_first_names: optionalText,
  passport_surname: optionalText,
  date_of_birth: optionalText,
  tshirt_size: optionalText,
  // Not nullable: the column is `not null default 'crew'`, so there is no
  // cleared state to express. Absent means the form had no input for it, which
  // is the tour-context edit panel, and toRow leaves the column alone.
  default_person_type: z.enum(['artist', 'crew', 'management', 'support']).optional(),
  default_role: optionalText,
  default_per_diem_rate: z.number().nonnegative().nullable().optional(),
  default_per_diem_currency: optionalText,
  default_daily_wage_rate: z.number().nonnegative().nullable().optional(),
  default_wage_currency: optionalText,
  notes: optionalText,
})

export type ContactForm = z.infer<typeof contactSchema>
