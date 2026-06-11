import { anthropic, MODELS } from '@/lib/ai/client'
import { CREW_QA_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { assembleTourContext } from '@/lib/ai/context'
import { logAiCall } from '@/lib/ai/log'
import type { TourContext } from '@/lib/ai/context'

export type AnswerCrewQuestionInput = {
  tour_id: string
  person_id: string
  question: string
}

export type AnswerCrewQuestionResult = {
  answer: string
  model_used: string
}

// Routes to Sonnet when the question requires synthesising across multiple
// entity types (e.g. comparing options, planning a route). Anything simpler
// uses Haiku. "and"/"or" alone are not sufficient signals: "what time is
// load-in and where is the hotel?" is a single-record lookup, not synthesis.
function chooseModel(question: string): string {
  const needsSynthesis = /\b(compare|best|route|options|itinerary|which\s+(show|hotel|flight|train|bus)|both\s+(shows?|hotels?|travel|flights?))\b/i.test(question)
  return needsSynthesis ? MODELS.sonnet : MODELS.haiku
}

// Strip PII for crew members other than the asker.
// The asker can see their own dietary, allergy and passport fields (may be
// relevant to their personal travel questions). They cannot see anyone else's.
function redactPiiForCrew(context: TourContext, personId: string): TourContext {
  return {
    ...context,
    people: context.people.map((p) => {
      if (p.id === personId) return p
      return {
        ...p,
        whatsapp_number: null,
        dietary: null,
        allergies: null,
        passport_expiry: null,
        passport_country: null,
      }
    }),
  }
}

export async function answerCrewQuestion(
  input: AnswerCrewQuestionInput
): Promise<AnswerCrewQuestionResult> {
  const rawContext = await assembleTourContext(input.tour_id)
  const context = redactPiiForCrew(rawContext, input.person_id)
  const model = chooseModel(input.question)
  const start = Date.now()

  const person = context.people.find((p) => p.id === input.person_id)
  const personLabel = person ? `${person.name} (${person.role ?? person.person_type})` : 'Unknown crew member'

  const userContent = `Tour context:\n${JSON.stringify(context, null, 2)}\n\nQuestion from ${personLabel}:\n${input.question}`

  // Tool use enforces the output schema. Claude cannot return free-form text
  // outside the tool call structure, which prevents hallucinated formatting.
  const response = await anthropic.messages.create({
    model,
    max_tokens: 512,
    // System as an array enables prompt caching. The block is marked ephemeral
    // so Anthropic caches it across calls in the same billing period.
    system: [
      {
        type: 'text' as const,
        text: CREW_QA_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'answer',
        description: 'Return the answer to the crew member question.',
        input_schema: {
          type: 'object' as const,
          properties: {
            answer: {
              type: 'string',
              description: 'The answer in plain English, ready to send as a WhatsApp message.',
            },
          },
          required: ['answer'],
        },
      },
    ],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: userContent }],
  })

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  const answer =
    toolUse && toolUse.type === 'tool_use' && typeof (toolUse.input as Record<string, unknown>).answer === 'string'
      ? (toolUse.input as { answer: string }).answer
      : 'Sorry, I could not find an answer for that. Ask your TM.'

  await logAiCall({
    tour_id: input.tour_id,
    model,
    trigger_case: 'crew_qa',
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
    duration_ms: Date.now() - start,
  })

  return { answer, model_used: model }
}
