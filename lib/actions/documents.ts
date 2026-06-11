'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { generateShareToken } from '@/lib/comms/email'
import { sendRiderEmailJob } from '@/trigger/jobs/send-rider-email'
import { advanceReminderJob } from '@/trigger/jobs/advance-reminder'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reeve.me'

export type SendRiderParams = {
  tourId: string
  showId: string
  documentId: string
  recipientPersonId: string
  // Optional note from the TM appended below the auto-generated body.
  note?: string | null
}

export type SendRiderResult = {
  error: string | null
}

// Creates a document_shares row and enqueues the rider email job.
// Each call is a new row with a new token: sending the same doc twice is
// intentional (e.g. resend to a second contact), so no deduplication here.
// The share ledger is append-mostly: old rows are never modified or deleted.
export async function sendRider(params: SendRiderParams): Promise<SendRiderResult> {
  const user = await requireUser()
  const { tourId, showId, documentId, recipientPersonId, note } = params

  const supabase = await createClient()

  // Verify tour ownership before any read or write.
  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artists(name, slug)')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.' }

  // Verify the show belongs to this tour.
  const { data: show } = await supabase
    .from('shows')
    .select('id')
    .eq('id', showId)
    .eq('tour_id', tourId)
    .single()

  if (!show) return { error: 'Show not found.' }

  // Fetch document (must belong to this tour).
  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, doc_type')
    .eq('id', documentId)
    .eq('tour_id', tourId)
    .single()

  if (!doc) return { error: 'Document not found.' }

  // Fetch recipient (must belong to this tour).
  const { data: personRow } = await supabase
    .from('people')
    .select('id, contacts(name, contact_email)')
    .eq('id', recipientPersonId)
    .eq('tour_id', tourId)
    .single()

  // Identity (name, email) lives on the contact.
  const person = personRow
    ? {
        id: personRow.id,
        ...((personRow.contacts as { name: string; contact_email: string | null } | null) ?? {
          name: '',
          contact_email: null,
        }),
      }
    : null

  if (!person) return { error: 'Person not found.' }
  if (!person.contact_email) return { error: `${person.name} does not have an email address on file.` }

  const shareToken = generateShareToken()
  const shareUrl = `${APP_URL}/a/${shareToken}`

  // Insert the share row before enqueuing so the job can write sent_at to it.
  // show_id is stored so the acknowledge API can locate the correct show_advance row.
  const { data: newShare, error: insertError } = await supabase
    .from('document_shares')
    .insert({
      tour_id: tourId,
      show_id: showId,
      document_id: documentId,
      recipient_person_id: recipientPersonId,
      channel: 'email',
      share_token: shareToken,
    })
    .select('id')
    .single()

  if (insertError || !newShare) return { error: insertError?.message ?? 'Failed to create share.' }

  // Enqueue the Trigger.dev job and return immediately.
  // The job writes sent_at to the share row after Resend confirms delivery.
  await sendRiderEmailJob.trigger({
    to: person.contact_email,
    recipient_name: person.name,
    artist_name: tour.artists?.name ?? tour.name,
    artist_slug: tour.artists?.slug ?? null,
    document_title: doc.title,
    share_token: shareToken,
    share_url: shareUrl,
    note: note ?? null,
  })

  // Schedule advance reminders. The job re-checks acknowledged_at before
  // sending, so these are safe to enqueue eagerly.
  const reminderBase = { tour_id: tourId, document_share_id: newShare.id }
  await advanceReminderJob.trigger({ ...reminderBase, reminder_index: 1 }, { delay: '3d' })
  await advanceReminderJob.trigger({ ...reminderBase, reminder_index: 2 }, { delay: '7d' })

  return { error: null }
}
