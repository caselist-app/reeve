import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractEmailForward } from '@/lib/ai/extract'

export type ExtractForwardPayload = {
  forwarded_email_id: string
}

// Sonnet extraction job. Triggered after the inbound webhook stores a
// forwarded_emails row. Reads the raw body, runs extraction, and writes
// proposed_rows back with extraction_status = 'extracted'.
// Never writes to the spine directly: that requires explicit TM confirmation.
export const extractForwardJob = task({
  id: 'extract-forward',
  run: async (payload: ExtractForwardPayload) => {
    const admin = createAdminClient()

    const { data: forwarded } = await admin
      .from('forwarded_emails')
      .select('id, tour_id, body_text, subject')
      .eq('id', payload.forwarded_email_id)
      .single()

    if (!forwarded) {
      console.error('[extract-forward] forwarded_email not found:', payload.forwarded_email_id)
      return { skipped: true, reason: 'not_found' }
    }

    // Build a labelled email string so the model has full context.
    const rawEmail = [
      `Subject: ${forwarded.subject ?? ''}`,
      ``,
      forwarded.body_text ?? '',
    ].join('\n')

    let proposed
    let status: 'extracted' | 'failed' = 'extracted'

    try {
      proposed = await extractEmailForward({
        tour_id: forwarded.tour_id,
        raw_email: rawEmail,
      })
    } catch (err) {
      console.error('[extract-forward] extraction failed:', err)
      status = 'failed'
    }

    // Write proposed_rows and advance the status.
    // On failure, the TM sees the row in the UI as 'failed' and can discard it.
    await admin
      .from('forwarded_emails')
      .update({
        proposed_rows: proposed ?? null,
        extraction_status: status,
      })
      .eq('id', forwarded.id)

    return { status, forwarded_email_id: forwarded.id }
  },
})
