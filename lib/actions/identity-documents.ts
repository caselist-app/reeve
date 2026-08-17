'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { readForm } from '@/lib/forms/read-form'
import { definedOnly } from '@/lib/forms/write-row'
import { identityDocumentSchema } from '@/lib/validators/identity-document'

type Client = Awaited<ReturnType<typeof createClient>>

export type CreateIdentityDocumentResult = { error: string | null; documentId: string | null }
export type IdentityDocumentActionResult = { error: string | null }

// Matches the identity-documents bucket's allowed_mime_types
// (supabase/migrations/20260815125511_identity_documents_bucket.sql).
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
// Matches the bucket's file_size_limit.
const MAX_FILE_BYTES = 10 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// The URL is consumed immediately by the click that requested it (Brief 45
// View scan), so it only needs to live long enough for the browser to load
// it, not to persist. A product decision, not a deployment one, so it is a
// constant here rather than an env var.
const SIGNED_URL_TTL_SECONDS = 60

// Uploads a passport or visa scan and creates its identity_documents row
// (REE-199, Brief 45 step 4). Flow: validate, upload to Storage, then insert
// the row. Every failure path from the upload onward deletes the object
// before returning: the bucket is private with no listing UI, so an object
// the row insert never linked to would be invisible and permanent. That
// includes a contact_id that turns out not to belong to this account, which
// is why the ownership check runs after the upload rather than before it,
// through the same rollback the row insert itself uses.
export async function createIdentityDocument(
  contactId: string,
  formData: FormData
): Promise<CreateIdentityDocumentResult> {
  const user = await requireUser()
  const supabase = await createClient()

  const strFields = readForm(formData, {
    kind: 'requiredString',
    document_number: 'string',
    surname: 'string',
    given_names: 'string',
    issuing_country: 'string',
    valid_for_country: 'string',
    visa_type: 'string',
    issue_date: 'string',
    expiry_date: 'string',
    notes: 'string',
  })

  const parsed = identityDocumentSchema.safeParse(strFields)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.', documentId: null }
  }
  const fields = parsed.data

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'No file provided.', documentId: null }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: 'That file type is not supported. Use PDF, JPEG, PNG or WebP.', documentId: null }
  }
  if (file.size > MAX_FILE_BYTES) return { error: 'File must be under 10 MB.', documentId: null }

  // Generated up front so the storage path can be built before anything is
  // written, and reused as the row's own id: nothing later needs a second key.
  const id = crypto.randomUUID()
  const extension = EXTENSIONS[file.type] ?? 'bin'
  // The first path segment must be the caller's own id: every bucket policy
  // checks (storage.foldername(name))[1] against auth.uid().
  const storagePath = `${user.id}/${contactId}/${id}.${extension}`

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('identity-documents')
    .upload(storagePath, bytes, { contentType: file.type })

  if (uploadError) return { error: uploadError.message, documentId: null }

  async function rollback(message: string): Promise<CreateIdentityDocumentResult> {
    await supabase.storage.from('identity-documents').remove([storagePath])
    return { error: message, documentId: null }
  }

  // account_id is read from the contact row, never taken from the client:
  // this is both the value the row is written under and the check that
  // contactId actually belongs to this account. Scoped by account_id as well
  // as id, matching getContact's pattern in lib/actions/contacts.ts.
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, account_id')
    .eq('id', contactId)
    .eq('account_id', user.id)
    .single()

  if (!contact) return rollback('Contact not found.')

  const { count: existingCount, error: countError } = await supabase
    .from('identity_documents')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .eq('kind', fields.kind)

  if (countError) return rollback(countError.message)

  const { error: insertError } = await supabase.from('identity_documents').insert({
    id,
    account_id: contact.account_id,
    contact_id: contactId,
    kind: fields.kind,
    is_primary: (existingCount ?? 0) === 0,
    storage_path: storagePath,
    file_name: file.name,
    mime_type: file.type,
    byte_size: file.size,
    ...definedOnly({
      document_number: fields.document_number,
      surname: fields.surname,
      given_names: fields.given_names,
      issuing_country: fields.issuing_country,
      valid_for_country: fields.valid_for_country,
      visa_type: fields.visa_type,
      issue_date: fields.issue_date,
      expiry_date: fields.expiry_date,
      notes: fields.notes,
    }),
  })

  if (insertError) return rollback(insertError.message)

  await syncPassportCache(supabase, contactId)
  await revalidateContact(supabase, contactId)

  return { error: null, documentId: id }
}

// Edits an existing identity_documents row's typed fields. There is no
// UPDATE path for the file itself: replacing a scan means deleting the
// record and adding it again, so this never touches Storage.
export async function updateIdentityDocument(
  documentId: string,
  formData: FormData
): Promise<IdentityDocumentActionResult> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('identity_documents')
    .select('id, contact_id')
    .eq('id', documentId)
    .eq('account_id', user.id)
    .single()

  if (!existing) return { error: 'Document not found.' }

  const strFields = readForm(formData, {
    kind: 'requiredString',
    document_number: 'string',
    surname: 'string',
    given_names: 'string',
    issuing_country: 'string',
    valid_for_country: 'string',
    visa_type: 'string',
    issue_date: 'string',
    expiry_date: 'string',
    notes: 'string',
  })

  const parsed = identityDocumentSchema.safeParse(strFields)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  const fields = parsed.data

  const { error } = await supabase
    .from('identity_documents')
    .update(
      definedOnly({
        kind: fields.kind,
        document_number: fields.document_number,
        surname: fields.surname,
        given_names: fields.given_names,
        issuing_country: fields.issuing_country,
        valid_for_country: fields.valid_for_country,
        visa_type: fields.visa_type,
        issue_date: fields.issue_date,
        expiry_date: fields.expiry_date,
        notes: fields.notes,
      })
    )
    .eq('id', documentId)

  if (error) return { error: error.message }

  await syncPassportCache(supabase, existing.contact_id)
  await revalidateContact(supabase, existing.contact_id)

  return { error: null }
}

// Unset then set, as two statements, in that order (Brief 45 step 6). The
// identity_documents_one_primary_per_kind_idx partial unique index allows
// only one primary per contact and kind, so setting before unsetting the
// current primary fails with 23505. There is a moment with no primary of
// that kind, which is harmless: no read path depends on a primary existing,
// because the roster reads contacts.passport_* rather than this table.
export async function setPrimaryIdentityDocument(
  documentId: string
): Promise<IdentityDocumentActionResult> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('identity_documents')
    .select('id, contact_id, kind')
    .eq('id', documentId)
    .eq('account_id', user.id)
    .single()

  if (!existing) return { error: 'Document not found.' }

  const { error: unsetError } = await supabase
    .from('identity_documents')
    .update({ is_primary: false })
    .eq('contact_id', existing.contact_id)
    .eq('kind', existing.kind)
    .eq('is_primary', true)

  if (unsetError) return { error: unsetError.message }

  const { error: setError } = await supabase
    .from('identity_documents')
    .update({ is_primary: true })
    .eq('id', documentId)

  if (setError) return { error: setError.message }

  await syncPassportCache(supabase, existing.contact_id)
  await revalidateContact(supabase, existing.contact_id)

  return { error: null }
}

// Deletes the storage object first, then the row (Brief 45 step 6). If the
// object delete fails, the row is left in place: a row pointing at a missing
// file renders a broken "View scan", and a row is recoverable while an
// orphaned object in a private bucket is not.
//
// Never syncs the passport cache. contacts.passport_* is written forward
// from a primary passport and this feature does not own it: a TM may have
// typed those fields years before any scan existed, and clearing the cache
// here would destroy hand-typed data on every delete.
export async function deleteIdentityDocument(
  documentId: string
): Promise<IdentityDocumentActionResult> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('identity_documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .eq('account_id', user.id)
    .single()

  if (!existing) return { error: 'Document not found.' }

  const { error: removeError } = await supabase.storage
    .from('identity-documents')
    .remove([existing.storage_path])

  if (removeError) return { error: removeError.message }

  const { error: deleteError } = await supabase
    .from('identity_documents')
    .delete()
    .eq('id', documentId)

  if (deleteError) return { error: deleteError.message }

  return { error: null }
}

export type SignIdentityDocumentUrlResult = { error: string | null; url: string | null }

// Signs a short-lived URL for "View scan" (Brief 45). Signed at click, never
// at render: the only two existing createSignedUrl calls in the repo
// (trigger/jobs/boarding-pass.ts, app/a/[token]/page.tsx) both sign ahead of
// time on the admin client, and neither is the pattern here. The account
// scoping on the select is the whole isolation guarantee: a document id from
// another account simply does not resolve, so nothing account-specific ever
// reaches storage.
export async function signIdentityDocumentUrl(
  documentId: string
): Promise<SignIdentityDocumentUrlResult> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('identity_documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .eq('account_id', user.id)
    .single()

  if (!existing) return { error: 'Document not found.', url: null }

  const { data: signed, error: signError } = await supabase.storage
    .from('identity-documents')
    .createSignedUrl(existing.storage_path, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed?.signedUrl) {
    return { error: signError?.message ?? 'Could not sign that scan.', url: null }
  }

  return { error: null, url: signed.signedUrl }
}

// Writes the five contacts.passport_* cache columns from the contact's
// primary passport. Never clears them: a TM may have typed a passport with
// no scan on file, and this feature does not own that data. Called by
// create, update and set-primary, and nothing else.
async function syncPassportCache(supabase: Client, contactId: string): Promise<void> {
  const { data: primary } = await supabase
    .from('identity_documents')
    .select('document_number, surname, given_names, issuing_country, expiry_date')
    .eq('contact_id', contactId)
    .eq('kind', 'passport')
    .eq('is_primary', true)
    .maybeSingle()

  if (!primary) return

  await supabase
    .from('contacts')
    .update(
      definedOnly({
        passport_number: primary.document_number,
        passport_surname: primary.surname,
        passport_first_names: primary.given_names,
        passport_country: primary.issuing_country,
        passport_expiry: primary.expiry_date,
      })
    )
    .eq('id', contactId)
}

// A contact is account-level and renders on the day roster of every tour
// they are on, plus the roster list and the roster page. Mirrors
// updateContact's fan-out in lib/actions/contacts.ts.
async function revalidateContact(supabase: Client, contactId: string): Promise<void> {
  const { data: memberships } = await supabase
    .from('people')
    .select('tour_id')
    .eq('contact_id', contactId)

  for (const tourId of new Set((memberships ?? []).map((m) => m.tour_id))) {
    revalidatePath(`/tours/${tourId}/schedule`)
  }

  revalidatePath('/roster')
  revalidatePath(`/roster/${contactId}`)
}
