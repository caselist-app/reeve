import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export type AiCallLogParams = {
  tour_id: string
  model: string
  trigger_case: 'crew_qa' | 'email_extraction' | 'logistics_synthesis'
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  duration_ms: number
}

// Logs every Claude inference call to ai_call_log for cost tracking.
// Non-fatal: if the insert fails, the call is still returned to the caller.
export async function logAiCall(params: AiCallLogParams): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('ai_call_log').insert(params)
  } catch (err) {
    console.warn('[ai/log] Failed to log AI call:', err)
  }
}
