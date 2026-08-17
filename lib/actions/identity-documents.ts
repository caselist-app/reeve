'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { readForm } from '@/lib/forms/read-form'
import { definedOnly } from '@/lib/forms/write-row'
import { identityDocumentSchema } from '@/lib/validators/identity-document'

export type CreateIdentityDocumentResult = { error: string | null; documentId: string | null }

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

  return { error: null, documentId: id }
}
