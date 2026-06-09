import { z } from 'zod'

export const hotelStayInsertSchema = z.object({
  tour_id: z.string().uuid(),
  city: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  check_in_date: z.string().nullable().optional(),
  check_in_time: z.string().nullable().optional(),
  check_out_date: z.string().nullable().optional(),
  check_out_time: z.string().nullable().optional(),
  room_block_size: z.number().int().positive().nullable().optional(),
  room_types_json: z.record(z.unknown()).optional(),
  negotiated_rate: z.number().nonnegative().nullable().optional(),
  rate_currency: z.string().length(3).nullable().optional(),
  confirmation_number: z.string().nullable().optional(),
  late_checkout: z.boolean().nullable().optional(),
  parking_json: z.record(z.unknown()).optional(),
  wifi_network: z.string().nullable().optional(),
  wifi_password: z.string().nullable().optional(),
  property_contact: z.string().nullable().optional(),
  incidentals_policy: z.string().nullable().optional(),
})

export const hotelStayUpdateSchema = hotelStayInsertSchema.partial()

export type HotelStayInsert = z.infer<typeof hotelStayInsertSchema>
export type HotelStayUpdate = z.infer<typeof hotelStayUpdateSchema>
