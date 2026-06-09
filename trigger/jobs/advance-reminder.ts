import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSendKey, checkAndSet } from '@/lib/comms/idempotency'
import { sendEmail } from '@/lib/comms/email'

export type AdvanceReminderPayload = {
  tour_id: string
  document_share_id: string
  reminder_index: number   // 1, 2, 3... so each reminder is a distinct dedup key
}

// Nudges a recipient who has not yet acknowledged a rider or advance document.
// Only fires for share rows that still have acknowledged_at = null.
// Dedup dimension: document_share_id:reminder_index.
// Re-check acknowledgement status before sending: the TM might have received
// word directly and marked it acknowledged in the meantime.
export const advanceReminderJob = task({
  id: 'advance-reminder',
  run: async (payload: AdvanceReminderPayload) => {
    const key = buildSendKey(
      payload.tour_id,
      payload.document_share_id,  // person_id slot reused for share id - still unique
      'advance_reminder',
      `${payload.document_share_id}:${payload.reminder_index}`
    )

    const safe = await checkAndSet(key, 60 * 60 * 24 * 30)
    if (!safe) return { skipped: true, reason: 'already_sent' }

    const admin = createAdminClient()

    // Check current acknowledgement state before sending.
    const { data: share } = await admin
      .from('document_shares')
      .select(`
        acknowledged_at,
        share_token,
        channel,
        recipient_person_id,
        documents ( title, doc_type, tour_id ),
        people ( name, contact_email )
      `)
      .eq('id', payload.document_share_id)
      .single()

    if (!share) return { skipped: true, reason: 'share_not_found' }
    if (share.acknowledged_at) return { skipped: true, reason: 'already_acknowledged' }

    const person = share.people as { name: string; contact_email: string | null } | null
    const doc = share.documents as { title: string; doc_type: string; tour_id: string } | null

    if (!person?.contact_email || !doc) {
      return { skipped: true, reason: 'missing_contact_or_document' }
    }

    // Get the tour's artist_slug for the from address.
    const { data: tour } = await admin
      .from('tours')
      .select('artist_slug, name')
      .eq('id', doc.tour_id)
      .single()

    if (!tour?.artist_slug) return { skipped: true, reason: 'no_artist_slug' }

    const reminderLabel = payload.reminder_index === 1 ? 'Reminder' : `Reminder ${payload.reminder_index}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reeve.me'
    const trackUrl = `${appUrl}/a/${share.share_token}`

    await sendEmail({
      to: person.contact_email,
      subject: `${reminderLabel}: ${doc.title}`,
      html: `
        <p>Hi ${person.name},</p>
        <p>This is a reminder to review and acknowledge <strong>${doc.title}</strong>.</p>
        <p><a href="${trackUrl}">View document</a></p>
        <p>Once you have reviewed it, please click the acknowledge button in the document.</p>
      `,
      artist_slug: tour.artist_slug,
      share_token: share.share_token,
    })

    return { sent: true, to: person.contact_email, reminder_index: payload.reminder_index }
  },
})
