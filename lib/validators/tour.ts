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

export const tourInsertSchema = z.object({
  account_id: z.string().uuid(),
  name: z.string().min(1),
  artist_id: z.string().uuid(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  territory: z.string().nullable().optional(),
  status: z.enum(['planning', 'active', 'completed', 'archived']).optional(),
  base_currency: z.string().length(3).optional(),
  timezone: z.string().nullable().optional(),
})

export const tourUpdateSchema = tourInsertSchema.partial()

export type TourInsert = z.infer<typeof tourInsertSchema>
export type TourUpdate = z.infer<typeof tourUpdateSchema>

// Action-facing schema: what the tour form sends to createTourAction / updateTourAction.
// account_id and status are set server-side; they are not part of this schema.
export const tourSchema = z.object({
  name: z.string().min(1, 'Tour name is required'),
  artist_id: z.string().uuid('Please select an artist'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  territory: z.string().optional(),
  base_currency: z.string().length(3).default('GBP'),
  timezone: z.string().optional(),
  inbound_qa_enabled: z.boolean().optional().default(false),
  morning_message_enabled: z.boolean().optional().default(false),
})

export type Tour = z.infer<typeof tourSchema>
