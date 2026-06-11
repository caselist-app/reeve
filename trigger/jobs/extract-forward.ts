import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractEmailForward } from '@/lib/ai/extract'

export type ExtractForwardPayload = {
  forwarded_email_id: string
  // Resend email_id used to fetch the body from the receiving API.
  // The webhook handler stores only metadata and passes the id here so the
  // handler returns 200 fast and avoids Svix redelivery retries.
  email_id: string
}

// Fetches the plain-text body of a received email from the Resend REST API.
async function fetchEmailBody(emailId: string): Promise<string> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Resend API ${res.status}`)
  const json = await res.json() as { text?: string | null; html?: string | null }
  return json.text ?? json.html ?? ''
}

// Sonnet extraction job. Triggered after the inbound webhook stores a
// forwarded_emails row. Fetches the email body from Resend, runs extraction,
// and writes proposed_rows back with extraction_status = 'extracted'.
// Never writes to the spine directly: that requires explicit TM confirmation.
export const extractForwardJob = task({
  id: 'extract-forward',
  run: async (payload: ExtractForwardPayload) => {
    const admin = createAdminClient()

    const { data: forwarded } = await admin
      .from('forwarded_emails')
      .select('id, tour_id, subject')
      .eq('id', payload.forwarded_email_id)
      .single()

    if (!forwarded) {
      console.error('[extract-forward] forwarded_email not found:', payload.forwarded_email_id)
      return { skipped: true, reason: 'not_found' }
    }

    // Fetch the email body here rather than in the webhook handler so the
    // handler can return 200 fast (avoiding Svix retries).
    let bodyText = ''
    try {
      bodyText = await fetchEmailBody(payload.email_id)
      await admin
        .from('forwarded_emails')
        .update({ body_text: bodyText })
        .eq('id', forwarded.id)
    } catch (err) {
      console.error('[extract-forward] failed to fetch email body:', err)
      // Continue with empty body: extraction will fail and the TM can discard.
    }

    // Build a labelled email string so the model has full context.
    const rawEmail = [
      `Subject: ${forwarded.subject ?? ''}`,
      ``,
      bodyText,
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
