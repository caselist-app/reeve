import { z } from 'zod'

export const transportSegmentInsertSchema = z.object({
  tour_id: z.string().uuid(),
  mode: z.enum(['bus', 'truck', 'flight', 'rail', 'ground', 'hire']),
  origin: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  depart_at: z.string().nullable().optional(),
  arrive_at: z.string().nullable().optional(),
  carrier_operator: z.string().nullable().optional(),
  vehicle_or_flight_no: z.string().nullable().optional(),
  booking_reference: z.string().nullable().optional(),
  // status intentionally omitted from insert: always defaults to 'planned'.
  // Promotion to 'booked' is a separate TM action, not a form field.
  company: z.string().nullable().optional(),
  driver_contact: z.string().nullable().optional(),
  details_json: z.record(z.unknown()).optional(),
  source_provider: z.string().nullable().optional(),
  door_to_site_at: z.string().nullable().optional(),
  book_url: z.string().url().nullable().optional(),
})

export const transportSegmentUpdateSchema = z
  .object({
    status: z.enum(['planned', 'booked', 'ticketed', 'changed', 'cancelled']),
  })
  .merge(transportSegmentInsertSchema)
  .partial()

export type TransportSegmentInsert = z.infer<typeof transportSegmentInsertSchema>
export type TransportSegmentUpdate = z.infer<typeof transportSegmentUpdateSchema>
