import { renderItinerary } from '@/lib/comms/templates/itinerary'
import { renderTravel } from '@/lib/comms/templates/travel'
import { renderHotel } from '@/lib/comms/templates/hotel'
import { renderCrew } from '@/lib/comms/templates/crew'

export type RouterInput = {
  from_number: string
  body: string
  tour_id: string
  person_id: string
}

export type RouterResult =
  | { action: 'template'; reply: string }
  | { action: 'ai'; reply: null }

// Slash commands are recognised by a leading / regardless of case.
// They are zero-AI template renders: no model call, no latency, no cost.
// Only free text that does not match any command goes to Claude.
const SLASH_COMMANDS = ['/itinerary', '/travel', '/hotel', '/crew'] as const
type SlashCommand = (typeof SLASH_COMMANDS)[number]

function parseSlashCommand(text: string): SlashCommand | null {
  const trimmed = text.trim().toLowerCase()
  for (const cmd of SLASH_COMMANDS) {
    if (trimmed === cmd || trimmed.startsWith(cmd + ' ')) {
      return cmd
    }
  }
  return null
}

async function handleSlashCommand(
  cmd: SlashCommand,
  input: RouterInput
): Promise<string> {
  switch (cmd) {
    case '/itinerary':
      return renderItinerary(input.person_id, input.tour_id)
    case '/travel':
      return renderTravel(input.person_id, input.tour_id)
    case '/hotel':
      return renderHotel(input.person_id, input.tour_id)
    case '/crew':
      return renderCrew(input.tour_id)
  }
}

// Route an inbound WhatsApp message to the correct handler.
// Returns a template reply immediately or signals that a Claude job should
// be enqueued. The webhook handler enqueues; it never calls Claude directly.
export async function routeInbound(input: RouterInput): Promise<RouterResult> {
  const cmd = parseSlashCommand(input.body)

  if (cmd) {
    const reply = await handleSlashCommand(cmd, input)
    return { action: 'template', reply }
  }

  // All unrecognised free text goes to the AI layer.
  // The caller (webhook handler or Trigger.dev job) enqueues the Claude job.
  return { action: 'ai', reply: null }
}
