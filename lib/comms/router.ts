import { createAdminClient } from '@/lib/supabase/admin'
import { renderItinerary } from '@/lib/comms/templates/itinerary'
import { renderTravel } from '@/lib/comms/templates/travel'
import { renderHotel } from '@/lib/comms/templates/hotel'
import { renderCrew } from '@/lib/comms/templates/crew'
import { renderGuestList } from '@/lib/comms/templates/guest-list'
import { handleGuestRequest, hasOpenGuestDraft } from '@/lib/comms/guest-request'

export type RouterInput = {
  from_number: string
  body: string
  tour_id: string
  person_id: string
  // Which inbound channel this arrived on. The guest request flow records it as
  // the entry's request_channel and it is the only command that needs it; the
  // template renders do not.
  channel: 'telegram' | 'whatsapp'
}

export type RouterResult =
  | { action: 'template'; reply: string }
  | { action: 'ai'; reply: null }

// Slash commands are recognised by a leading / regardless of case.
// They are zero-AI template renders: no model call, no latency, no cost.
// Only free text that does not match any command goes to Claude.
//
// Adding a command is three edits in this file: the tuple, a case in
// handleSlashCommand, and the render import. The switch is exhaustive over the
// union, so a missing case is a compile error. /guestlist sits before /guest so
// the longer command is matched first; the trailing-space rule below makes the
// order safe either way, but the intent reads clearer this way.
const SLASH_COMMANDS = ['/itinerary', '/travel', '/hotel', '/crew', '/guestlist', '/guest'] as const
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

// The text after a command word, with the command and one following space
// removed. /guest carries the guest details on the same line.
function commandArgs(body: string, cmd: SlashCommand): string {
  return body.trim().slice(cmd.length).trim()
}

async function handleSlashCommand(cmd: SlashCommand, input: RouterInput): Promise<string> {
  switch (cmd) {
    case '/itinerary':
      return renderItinerary(input.person_id, input.tour_id)
    case '/travel':
      return renderTravel(input.person_id, input.tour_id)
    case '/hotel':
      return renderHotel(input.person_id, input.tour_id)
    case '/crew':
      return renderCrew(input.tour_id)
    case '/guestlist':
      return renderGuestList(input.person_id, input.tour_id)
    case '/guest': {
      const result = await handleGuestRequest(createAdminClient(), {
        tourId: input.tour_id,
        personId: input.person_id,
        channel: input.channel,
        text: commandArgs(input.body, cmd),
      })
      return result.reply
    }
  }
}

// Route an inbound WhatsApp or Telegram message to the correct handler.
// Returns a template reply immediately or signals that a Claude job should
// be enqueued. The webhook handler enqueues; it never calls Claude directly.
export async function routeInbound(input: RouterInput): Promise<RouterResult> {
  const cmd = parseSlashCommand(input.body)

  if (cmd) {
    const reply = await handleSlashCommand(cmd, input)
    return { action: 'template', reply }
  }

  // A /guest request is the one flow that spans several messages. Its state lives
  // in a draft row, so a plain reply while a draft is open is an answer to that
  // flow, not a question for the AI. This check runs before the AI opt-in gate,
  // deliberately: guest requests are on for every tour and never gated.
  const supabase = createAdminClient()
  if (await hasOpenGuestDraft(supabase, input.tour_id, input.person_id)) {
    const result = await handleGuestRequest(supabase, {
      tourId: input.tour_id,
      personId: input.person_id,
      channel: input.channel,
      text: input.body,
    })
    return { action: 'template', reply: result.reply }
  }

  // All other unrecognised free text goes to the AI layer.
  // The caller (webhook handler or Trigger.dev job) enqueues the Claude job.
  return { action: 'ai', reply: null }
}
