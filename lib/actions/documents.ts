'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateShareToken } from '@/lib/comms/email'
import { sendRiderEmailJob } from '@/trigger/jobs/send-rider-email'
import { advanceReminderJob } from '@/trigger/jobs/advance-reminder'
import { uploadDocumentSchema } from '@/lib/validators/documents'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tourwithreeve.com'

export type SendDocumentParams = {
  tourId: string
  documentId: string
  recipientPersonIds: string[]
  // Reminders only fire when a show is attached: a tour-level informational
  // send (e.g. a routing sheet to management) has no advance to chase.
  showId?: string | null
  // Optional note from the TM appended below the auto-generated body.
  note?: string | null
}

export type SendDocumentResult = {
  error: string | null
}

// Creates one document_shares row (and one share_token) per recipient, and
// enqueues the rider email job for each. Each row is a new token: sending the
// same doc twice is intentional (e.g. resend to a second contact), so no
// deduplication here. The share ledger is append-mostly: old rows are never
// modified or deleted.
//
// Brief 39 Part 1 calls this the reference pattern for cross-tour id checks
// under its old name (sendRider): every id in the payload is verified against
// tourId before use, because RLS only proves the caller owns tourId, not that
// the other ids in the payload belong to it.
export async function sendDocument(params: SendDocumentParams): Promise<SendDocumentResult> {
  const user = await requireUser()
  const { tourId, documentId, recipientPersonIds, showId, note } = params

  const supabase = await createClient()

  // Verify tour ownership before any read or write.
  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artists(name, slug)')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.' }

  // Fetch document (must belong to this tour).
  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, doc_type')
    .eq('id', documentId)
    .eq('tour_id', tourId)
    .single()

  if (!doc) return { error: 'Document not found.' }

  // Verify the show belongs to this tour, only when one was given.
  if (showId) {
    const { data: show } = await supabase
      .from('shows')
      .select('id')
      .eq('id', showId)
      .eq('tour_id', tourId)
      .single()

    if (!show) return { error: 'Show not found.' }
  }

  // Guard the empty array: an empty .in() is a round trip that can only
  // return nothing.
  if (recipientPersonIds.length === 0) return { error: 'Select at least one recipient.' }

  // Fetch every recipient in one query, scoped to this tour, then assert the
  // returned count equals the requested count so a person from another tour
  // is caught rather than silently dropped from the send.
  const { data: peopleRows } = await supabase
    .from('people')
    .select('id, contacts(name, contact_email)')
    .eq('tour_id', tourId)
    .in('id', recipientPersonIds)

  const distinctIds = new Set(recipientPersonIds)
  if ((peopleRows?.length ?? 0) !== distinctIds.size) {
    return { error: 'One or more recipients are not on this tour.' }
  }

  // Identity (name, email) lives on the contact.
  const people = (peopleRows ?? []).map((row) => ({
    id: row.id,
    ...((row.contacts as { name: string; contact_email: string | null } | null) ?? {
      name: '',
      contact_email: null,
    }),
  }))

  const missingEmail = people.find((person) => !person.contact_email)
  if (missingEmail) {
    return { error: `${missingEmail.name} does not have an email address on file.` }
  }

  // Insert one share row per recipient, each with its own token, before
  // enqueuing so the job can write sent_at to it. show_id is stored so the
  // acknowledge API can locate the correct show_advance row.
  const { data: newShares, error: insertError } = await supabase
    .from('document_shares')
    .insert(
      people.map((person) => ({
        tour_id: tourId,
        show_id: showId ?? null,
        document_id: documentId,
        recipient_person_id: person.id,
        channel: 'email',
        share_token: generateShareToken(),
      }))
    )
    .select('id, recipient_person_id, share_token')

  if (insertError || !newShares || newShares.length !== people.length) {
    return { error: insertError?.message ?? 'Failed to create shares.' }
  }

  const peopleById = new Map(people.map((person) => [person.id, person]))

  // Enqueue the Trigger.dev job for each recipient and return immediately.
  // The job writes sent_at to its share row after Resend confirms delivery.
  await Promise.all(
    newShares.map((share) => {
      const person = peopleById.get(share.recipient_person_id)
      if (!person?.contact_email) return Promise.resolve()

      const shareUrl = `${APP_URL}/a/${share.share_token}`

      return sendRiderEmailJob.trigger({
        to: person.contact_email,
        recipient_name: person.name,
        artist_name: tour.artists?.name ?? tour.name,
        artist_slug: tour.artists?.slug ?? null,
        document_title: doc.title,
        share_token: share.share_token,
        share_url: shareUrl,
        note: note ?? null,
      })
    })
  )

  // Schedule advance reminders, only when this send is attached to a show.
  // The job re-checks acknowledged_at before sending, so these are safe to
  // enqueue eagerly.
  if (showId) {
    await Promise.all(
      newShares.map((share) => {
        const reminderBase = { tour_id: tourId, document_share_id: share.id }
        return Promise.all([
          advanceReminderJob.trigger({ ...reminderBase, reminder_index: 1 }, { delay: '3d' }),
          advanceReminderJob.trigger({ ...reminderBase, reminder_index: 2 }, { delay: '7d' }),
        ])
      })
    )
  }

  // The Documents page renders every document's share log; a share created
  // from the advance panel or a resend must show up there too.
  revalidatePath(`/tours/${tourId}/documents`)

  return { error: null }
}

// Resends a document to the same recipient a document_shares row already went
// to. Reuses sendDocument rather than duplicating its insert-and-enqueue
// logic: a resend is intentionally a brand new share row with its own token,
// not a mutation of the old one (document_shares is append-mostly).
export async function resendShare(shareId: string): Promise<SendDocumentResult> {
  await requireUser()
  const supabase = await createClient()

  // RLS scopes this to the caller's own tour, so no separate ownership check.
  const { data: share } = await supabase
    .from('document_shares')
    .select('tour_id, show_id, document_id, recipient_person_id')
    .eq('id', shareId)
    .single()

  if (!share) return { error: 'Share not found.' }
  if (!share.show_id) return { error: 'This document was not sent for a show.' }

  return sendDocument({
    tourId: share.tour_id,
    showId: share.show_id,
    documentId: share.document_id,
    recipientPersonIds: [share.recipient_person_id],
  })
}

export type UploadDocumentState = { error: string | null }

// Matches the documents bucket's allowed_mime_types
// (supabase/migrations/20260610130000_documents_storage_bucket.sql).
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
// Matches the bucket's file_size_limit.
const MAX_FILE_BYTES = 10 * 1024 * 1024

// Keeps only what is safe in a Storage path segment. Everything else becomes
// a dash, so a filename with spaces, unicode or path separators in it cannot
// alter the path shape the {tourId}/{docType}/... prefix depends on.
function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file'
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 150)
  return cleaned || 'file'
}

// Uploads a new version of a tour document. Flow: verify ownership, validate
// the file, flip every existing row for this tour_id/doc_type to
// is_current = false, upload to Storage, then insert the new row as current.
//
// The is_current flip runs BEFORE the insert, never after: with it after, a
// window exists where two rows for the same doc_type both read is_current,
// which is the exact "which one is current" ambiguity the flag exists to
// prevent. tests/integration/documents-store.test.ts is red against the
// reversed order.
//
// No upsert on the Storage write: the documents bucket has no UPDATE policy
// (that is a later brief's work), and it does not need one, because the path
// is unique per version.
export async function uploadDocument(
  tourId: string,
  formData: FormData
): Promise<UploadDocumentState> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.' }

  const parsed = uploadDocumentSchema.safeParse({
    docType: formData.get('doc_type'),
    title: formData.get('title'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  const { docType, title } = parsed.data

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'No file provided.' }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: 'Only PDF, JPEG, PNG or WebP files are accepted.' }
  }
  if (file.size > MAX_FILE_BYTES) return { error: 'File must be under 10 MB.' }

  const admin = createAdminClient()

  // Next version for this tour's doc_type is one past the highest version on
  // record, current or not: old rows are kept rather than deleted, so this is
  // the only source of truth for "how many versions has this doc_type had."
  const { data: latest, error: latestError } = await admin
    .from('documents')
    .select('version')
    .eq('tour_id', tourId)
    .eq('doc_type', docType)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) return { error: latestError.message }

  const version = (latest?.version ?? 0) + 1
  // The tour id must be the first path segment: the bucket policy is
  // owns_tour((storage.foldername(name))[1]::uuid).
  const storagePath = `${tourId}/${docType}/v${version}_${safeFilename(file.name)}`

  // Flip the old rows to not-current before anything about the new one exists,
  // so there is never a moment with two current rows for this doc_type.
  const { error: flipError } = await admin
    .from('documents')
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq('tour_id', tourId)
    .eq('doc_type', docType)
    .eq('is_current', true)
  if (flipError) return { error: flipError.message }

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('documents')
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    })
  if (uploadError) return { error: uploadError.message }

  const { error: insertError } = await admin.from('documents').insert({
    tour_id: tourId,
    doc_type: docType,
    title,
    version,
    storage_path: storagePath,
    is_current: true,
  })
  if (insertError) return { error: insertError.message }

  revalidatePath(`/tours/${tourId}/documents`)

  return { error: null }
}
