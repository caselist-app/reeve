import { z } from 'zod'

// Curated IANA timezone list for touring. Full IANA list has ~600 entries;
// this covers the territories where tours operate.
export const TOUR_TIMEZONES: { value: string; label: string }[] = [
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
  { value: 'Europe/Stockholm', label: 'Stockholm (CET/CEST)' },
  { value: 'Europe/Helsinki', label: 'Helsinki (EET/EEST)' },
  { value: 'Europe/Athens', label: 'Athens (EET/EEST)' },
  { value: 'Europe/Lisbon', label: 'Lisbon (WET/WEST)' },
  { value: 'Europe/Warsaw', label: 'Warsaw (CET/CEST)' },
  { value: 'Europe/Zurich', label: 'Zurich (CET/CEST)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/Denver', label: 'Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'America/Toronto', label: 'Toronto (ET)' },
  { value: 'America/Vancouver', label: 'Vancouver (PT)' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST/CDT)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (ART)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
]

// Action-facing schema: what the tour form sends to createTourAction / updateTourAction.
// account_id and status are set server-side; they are not part of this schema.
export const tourSchema = z.object({
  name: z.string().min(1, 'Tour name is required'),
  artist_id: z.string().uuid('Please select an artist'),
  // Nullable as well as optional: undefined means the form never sent this
  // field, null means the TM submitted it blank to clear it. See readForm in
  // lib/forms/read-form.ts, and parseTourSettingsFormData below, which is the
  // caller that actually produces null.
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  territory: z.string().nullable().optional(),
  base_currency: z.string().length(3),
  timezone: z.string().nullable().optional(),
  // Required rather than optional-with-a-default. Both parse functions in
  // lib/actions/tours.ts always supply a concrete boolean, so the defaults were
  // dead, and a dead .default() is the worst kind: it is doing nothing until the
  // day a partial caller appears, at which point it invents a value for a key
  // nobody submitted and switches a TM's comms off without saying so. Making
  // these required means the compiler names that caller instead.
  // scripts/check-conventions.mjs now fails a .default() anywhere in here.
  inbound_qa_enabled: z.boolean(),
  morning_message_enabled: z.boolean(),
})

export type Tour = z.infer<typeof tourSchema>

// Settings-page schema: what components/tours/settings-form.tsx sends to
// updateTourAction. The settings page edits a subset of the tour and does not
// manage the artist, so artist_id is deliberately not part of it.
//
// Validating a settings save against tourSchema was a real bug: that schema
// requires artist_id, the settings form never renders it, so formData.get()
// returned null and Zod reported the raw type error "Expected string, received
// null" rather than the friendly uuid message. Every settings save failed,
// including both comms toggles. Fixed 2026-08-04. Keep the two schemas apart:
// a form that edits a subset validates against a schema for that subset.
export const tourSettingsSchema = tourSchema.omit({ artist_id: true })

export type TourSettings = z.infer<typeof tourSettingsSchema>
