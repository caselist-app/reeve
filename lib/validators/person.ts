import { z } from 'zod'

// E.164: + followed by country code (1 non-zero digit) and 6-14 more digits.
const e164Regex = /^\+[1-9]\d{6,14}$/

// Optional and nullable are different states and both are needed. See the note
// at the top of lib/validators/contact.ts for the rule, and
// lib/forms/read-form.ts for where it is decided.
const optionalText = z.string().nullable().optional()

// Form DTO for adding or editing a tour member. It carries both the person's
// identity (name, passport, dietary, channels) and their terms on this tour
// (person_type, role). The people action splits the write: identity is persisted
// to the account-level contact (the single source of truth), the membership
// (person_type, role) to people. See lib/actions/people.ts. tour_id is not here;
// it is passed as a separate argument to the action.
//
// A key missing from this schema is not a no-op, it is a silent drop: Zod
// strips anything it does not declare, so contact-sheet.tsx posted `notes` on
// the add path for months and addPerson never saw it, while the identical
// textarea saved correctly on edit. That is why this schema and contactSchema
// have to be kept in step field for field.
export const personSchema = z.object({
  person_type: z.enum(['artist', 'crew', 'management', 'support']),
  name: z.string().min(1, 'Name is required'),
  role: optionalText,
  // No empty-string branch, matching contactSchema. An emptied input is null.
  contact_email: z.string().email('Enter a valid email address').nullable().optional(),
  contact_phone: optionalText,
  // Nullable: a brand-new contact with no WhatsApp number and no Telegram
  // link yet has no operational channel, a real state, not an error.
  operational_channel: z.enum(['whatsapp', 'telegram']).nullable().optional(),
  // Independent of the operational channel: email serves a different purpose
  // (formal riders and advancing documents), not the day-to-day stream.
  email_enabled: z.boolean().optional(),
  // An emptied input arrives as null. Only a non-empty value has to be E.164.
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
  passport_first_names: optionalText,
  passport_surname: optionalText,
  passport_number: optionalText,
  passport_expiry: optionalText,
  passport_country: optionalText,
  date_of_birth: optionalText,
  tshirt_size: optionalText,
  notes: optionalText,
})

// Nullable as well as optional, and the difference is the whole of Brief 37's
// second instance. A blank rate input arrives as null and has to clear the
// stored rate; a rate field the form never rendered arrives as undefined and
// has to leave it alone. These were both undefined before, so a TM could set a
// per diem and never take it off again.
//
// nonnegative rather than positive: zero is a rate a TM can mean, and rejecting
// it pushes them toward clearing the field to express it, which means something
// else.
export const crewDetailSchema = z.object({
  per_diem_rate: z.number().nonnegative().nullable().optional(),
  per_diem_currency: optionalText,
  daily_wage_rate: z.number().nonnegative().nullable().optional(),
  wage_currency: optionalText,
})

export type Person = z.infer<typeof personSchema>
export type CrewDetail = z.infer<typeof crewDetailSchema>
