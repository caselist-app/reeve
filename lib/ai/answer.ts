import { anthropic, MODELS } from '@/lib/ai/client'
import { CREW_QA_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { assembleTourContext } from '@/lib/ai/context'
import { createAdminClient } from '@/lib/supabase/admin'

export type AnswerCrewQuestionInput = {
  tour_id: string
  person_id: string
  question: string
}

export type AnswerCrewQuestionResult = {
  answer: string
  model_used: string
}

// Heuristic: questions that reference multiple entities (transport, hotels,
// shows) need Sonnet. Simple single-record lookups can use Haiku.
function chooseModel(question: string): string {
  const needsSynthesis = /\b(and|or|both|all|compare|best|which|route|options)\b/i.test(question)
  return needsSynthesis ? MODELS.sonnet : MODELS.haiku
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

export async function answerCrewQuestion(
  input: AnswerCrewQuestionInput
): Promise<AnswerCrewQuestionResult> {
  const context = await assembleTourContext(input.tour_id)
  const model = chooseModel(input.question)
  const start = Date.now()

  // Find the asking person so we can personalise and scope the answer.
  const person = context.people.find((p) => p.id === input.person_id)
  const personLabel = person ? `${person.name} (${person.role ?? person.person_type})` : 'Unknown crew member'

  const userContent = `Tour context:\n${JSON.stringify(context, null, 2)}\n\nQuestion from ${personLabel}:\n${input.question}`

  // Tool use enforces the output schema. Claude cannot return free-form text
  // outside the tool call structure, which prevents hallucinated formatting.
  const response = await anthropic.messages.create({
    model,
    max_tokens: 512,
    system: CREW_QA_SYSTEM_PROMPT,
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
    cache_read_tokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
    cache_write_tokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
    duration_ms: Date.now() - start,
  })

  return { answer, model_used: model }
}
