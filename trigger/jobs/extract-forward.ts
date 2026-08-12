import { task } from '@trigger.dev/sdk/v3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractEmailForward } from '@/lib/ai/extract'
import type { Database } from '@/lib/types/database'

type Client = SupabaseClient<Database>

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

export type RunExtractionResult = { status: 'extracted' | 'failed' }

// The extraction-and-write core (REE-153), split out from the Resend fetch
// below so it runs against a real Postgres in a test with no network at all:
// the only thing that needs stubbing is the extraction adapter
// (extractEmailForward), which is the actual AI boundary (CLAUDE.md, "AI is a
// thin intelligent layer"). Writes proposed_rows and extraction_status, then
// makes extraction a producer: an attention_items row for either terminal
// state, so a failed or waiting-on-review extraction shows up in the Inbox the
// same way a guest request does (lib/guest-list/attention.ts). 'failed' is
// written at severity 2, ahead of the table's default 3, because it needs the
// TM's attention sooner than one just waiting on review. related_table points
// at forwarded_emails so confirmExtraction and discardExtraction can resolve
// it through resolveAttentionItem the same way any other producer's caller
// does, never before the write it is reporting on succeeds.
export async function runExtraction(
  supabase: Client,
  args: { forwardedEmailId: string; tourId: string; subject: string | null; bodyText: string }
): Promise<RunExtractionResult> {
  // Build a labelled email string so the model has full context.
  const rawEmail = [`Subject: ${args.subject ?? ''}`, ``, args.bodyText].join('\n')

  let proposed
  let status: 'extracted' | 'failed' = 'extracted'

  try {
    proposed = await extractEmailForward({
      tour_id: args.tourId,
      raw_email: rawEmail,
    })
  } catch (err) {
    console.error('[extract-forward] extraction failed:', err)
    status = 'failed'
  }

  // Write proposed_rows and advance the status.
  // On failure, the TM sees the row in the UI as 'failed' and can discard it.
  await supabase
    .from('forwarded_emails')
    .update({
      proposed_rows: proposed ?? null,
      extraction_status: status,
    })
    .eq('id', args.forwardedEmailId)

  const { error: attentionError } = await supabase.from('attention_items').insert({
    tour_id: args.tourId,
    kind: 'email_extraction',
    title: args.subject || 'Forwarded email',
    related_table: 'forwarded_emails',
    related_id: args.forwardedEmailId,
    ...(status === 'failed' ? { severity: 2 } : {}),
  })
  if (attentionError) {
    console.error('[extract-forward] could not write attention item:', attentionError.message)
  }

  return { status }
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

    const result = await runExtraction(admin, {
      forwardedEmailId: forwarded.id,
      tourId: forwarded.tour_id,
      subject: forwarded.subject,
      bodyText,
    })

    return { status: result.status, forwarded_email_id: forwarded.id }
  },
})
