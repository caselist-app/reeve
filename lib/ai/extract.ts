import { anthropic, MODELS } from '@/lib/ai/client'
import { EMAIL_EXTRACTION_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { createAdminClient } from '@/lib/supabase/admin'

export type ExtractEmailForwardInput = {
  tour_id: string
  raw_email: string   // full raw email text forwarded by the TM
}

// Proposed rows extracted from the email. Never written to the spine directly.
// The TM confirms each row before it lands.
export type ExtractionProposal = {
  shows: Array<{
    date: string | null
    venue_name: string | null
    address: string | null
    load_in_at: string | null
    curfew_at: string | null
  }>
  transport_segments: Array<{
    mode: string | null
    origin: string | null
    destination: string | null
    depart_at: string | null
    arrive_at: string | null
    carrier_operator: string | null
    vehicle_or_flight_no: string | null
    booking_reference: string | null
  }>
  hotel_stays: Array<{
    name: string | null
    city: string | null
    address: string | null
    check_in_date: string | null
    check_out_date: string | null
    check_in_time: string | null
    check_out_time: string | null
    confirmation_number: string | null
  }>
}

async function logAiCall(params: {
  tour_id: string
  model: string
  trigger_case: 'crew_qa' | 'email_extraction' | 'logistics_synthesis'
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  duration_ms: number
}): Promise<void> {
  const admin = createAdminClient()
  await admin.from('ai_call_log').insert(params)
}

export async function extractEmailForward(
  input: ExtractEmailForwardInput
): Promise<ExtractionProposal> {
  const start = Date.now()

  const response = await anthropic.messages.create({
    model: MODELS.sonnet,
    max_tokens: 2048,
    system: EMAIL_EXTRACTION_SYSTEM_PROMPT,
    tools: [
      {
        name: 'extract_tour_data',
        description: 'Extract structured tour data from the forwarded email.',
        input_schema: {
          type: 'object' as const,
          properties: {
            shows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
                  venue_name: { type: ['string', 'null'] },
                  address: { type: ['string', 'null'] },
                  load_in_at: { type: ['string', 'null'], description: 'ISO 8601' },
                  curfew_at: { type: ['string', 'null'], description: 'ISO 8601' },
                },
              },
            },
            transport_segments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  mode: { type: ['string', 'null'], enum: ['flight', 'rail', 'ground', 'bus', 'hire', null] },
                  origin: { type: ['string', 'null'] },
                  destination: { type: ['string', 'null'] },
                  depart_at: { type: ['string', 'null'], description: 'ISO 8601' },
                  arrive_at: { type: ['string', 'null'], description: 'ISO 8601' },
                  carrier_operator: { type: ['string', 'null'] },
                  vehicle_or_flight_no: { type: ['string', 'null'] },
                  booking_reference: { type: ['string', 'null'] },
                },
              },
            },
            hotel_stays: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: ['string', 'null'] },
                  city: { type: ['string', 'null'] },
                  address: { type: ['string', 'null'] },
                  check_in_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
                  check_out_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
                  check_in_time: { type: ['string', 'null'], description: 'HH:MM' },
                  check_out_time: { type: ['string', 'null'], description: 'HH:MM' },
                  confirmation_number: { type: ['string', 'null'] },
                },
              },
            },
          },
          required: ['shows', 'transport_segments', 'hotel_stays'],
        },
      },
    ],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: `Tour ID: ${input.tour_id}\n\nForwarded email:\n\n${input.raw_email}`,
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  const extracted =
    toolUse && toolUse.type === 'tool_use'
      ? (toolUse.input as ExtractionProposal)
      : { shows: [], transport_segments: [], hotel_stays: [] }

  await logAiCall({
    tour_id: input.tour_id,
    model: MODELS.sonnet,
    trigger_case: 'email_extraction',
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_tokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
    cache_write_tokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
    duration_ms: Date.now() - start,
  })

  return extracted
}
