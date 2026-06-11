import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/comms/email'
import { renderAdvanceReminderEmail } from '@/lib/comms/templates/advance-reminder'

export type AdvanceReminderPayload = {
  tour_id: string
  document_share_id: string
  reminder_index: number   // 1, 2, 3... each reminder is a distinct dedup key
}

// Nudges a recipient who has not yet acknowledged a rider or advance document.
// Only fires for share rows where acknowledged_at is still null.
// Re-checks before sending: the TM may have received word directly.
// Dedup key: tour_id + share_id + reminder_index. Safe to retry.
export const advanceReminderJob = task({
  id: 'advance-reminder',
  run: async (payload: AdvanceReminderPayload) => {
    const admin = createAdminClient()

    // Fetch share first so we have person_id for the notification_log claim.
    const { data: share } = await admin
      .from('document_shares')
      .select(`
        id,
        acknowledged_at,
        share_token,
        reminder_count,
        recipient_person_id,
        documents ( title, doc_type, tour_id ),
        people ( contacts ( name, contact_email ) )
      `)
      .eq('id', payload.document_share_id)
      .single()

    if (!share) return { skipped: true, reason: 'share_not_found' }
    if (share.acknowledged_at) return { skipped: true, reason: 'already_acknowledged' }

    // Claim the send slot before doing any further work.
    const claimKey = {
      tour_id: payload.tour_id,
      person_id: share.recipient_person_id,
      notification_type: 'advance_reminder' as const,
      channel: 'email' as const,
      dedup_dimension: `${payload.document_share_id}:${payload.reminder_index}`,
    }
    const { error: claimError } = await admin
      .from('notification_log')
      .insert({ ...claimKey, status: 'queued' })

    if (claimError?.code === '23505') return { skipped: true, reason: 'already_sent' }
    if (claimError) throw new Error(`[advance-reminder] claim failed: ${claimError.message}`)

    const personRow = share.people as {
      contacts: { name: string; contact_email: string | null } | null
    } | null
    const person = personRow?.contacts ?? null
    const doc = share.documents as { title: string; doc_type: string; tour_id: string } | null

    if (!person?.contact_email || !doc) {
      await admin.from('notification_log').delete().match(claimKey)
      return { skipped: true, reason: 'missing_contact_or_document' }
    }

    const { data: tour } = await admin
      .from('tours')
      .select('name, artists(name, slug)')
      .eq('id', doc.tour_id)
      .single()

    if (!tour) {
      await admin.from('notification_log').delete().match(claimKey)
      return { skipped: true, reason: 'tour_not_found' }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reeve.me'
    const shareUrl = `${appUrl}/a/${share.share_token}`
    const artistName = tour.artists?.name ?? tour.name

    const html = renderAdvanceReminderEmail({
      recipientName: person.name,
      artistName,
      documentTitle: doc.title,
      showDate: '',
      venueName: '',
      shareUrl,
      reminderIndex: payload.reminder_index,
    })

    try {
      const { id: resendId } = await sendEmail({
        to: person.contact_email,
        subject: `Reminder: ${doc.title} - ${artistName}`,
        html,
        artist_slug: tour.artists?.slug ?? null,
        share_token: share.share_token,
      })

      await admin
        .from('notification_log')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: resendId ?? null })
        .match(claimKey)

      await admin
        .from('document_shares')
        .update({ reminder_count: (share.reminder_count ?? 0) + 1 })
        .eq('id', payload.document_share_id)

      return { sent: true, to: person.contact_email, reminder_index: payload.reminder_index }
    } catch (err) {
      // Release the claim so a job retry can re-attempt.
      await admin.from('notification_log').delete().match(claimKey)
      throw err
    }
  },
})
