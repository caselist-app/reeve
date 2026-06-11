'use server'

import { z } from 'zod'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleBoardingPassSend } from '@/lib/actions/transport'

export type UploadBoardingPassState = { error: string | null }

// Uploads a boarding pass PDF for a transport_assignment.
// Flow: store in Supabase Storage -> insert documents row -> link via
// boarding_pass_document_id -> enqueue the boarding pass send job.
export async function uploadBoardingPassAction(
  tourId: string,
  assignmentId: string,
  formData: FormData
): Promise<UploadBoardingPassState> {
  const assignmentIdParsed = z.string().uuid().safeParse(assignmentId)
  if (!assignmentIdParsed.success) return { error: 'Invalid assignment.' }
  const safeAssignmentId = assignmentIdParsed.data

  const user = await requireUser()
  const supabase = await createClient()

  // Verify the TM owns this tour before accepting the upload.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.' }

  const file = formData.get('boarding_pass') as File | null
  if (!file || file.size === 0) return { error: 'No file provided.' }
  if (file.type !== 'application/pdf') return { error: 'Only PDF files are accepted.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'File must be under 10 MB.' }

  const storagePath = `${tourId}/boarding-passes/${safeAssignmentId}.pdf`
  const bytes = await file.arrayBuffer()

  // Use the admin client for storage so the service role key signs the upload.
  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from('documents')
    .upload(storagePath, bytes, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) return { error: uploadError.message }

  // Check if the assignment already has a boarding pass document linked.
  // Scope to tour_id to prevent cross-tour writes through the admin client.
  const { data: existingAssignment } = await admin
    .from('transport_assignments')
    .select('boarding_pass_document_id')
    .eq('id', safeAssignmentId)
    .eq('tour_id', tourId)
    .single()

  let docId: string

  if (existingAssignment?.boarding_pass_document_id) {
    // Update the existing document row with the new storage path.
    const { error: updateError } = await admin
      .from('documents')
      .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
      .eq('id', existingAssignment.boarding_pass_document_id)

    if (updateError) return { error: updateError.message }
    docId = existingAssignment.boarding_pass_document_id
  } else {
    // Insert a new document row and link it.
    const { data: newDoc, error: docError } = await admin
      .from('documents')
      .insert({
        tour_id: tourId,
        doc_type: 'boarding_pass',
        title: `Boarding pass`,
        storage_path: storagePath,
        is_current: true,
      })
      .select('id')
      .single()

    if (docError || !newDoc) return { error: docError?.message ?? 'Failed to save document record.' }
    docId = newDoc.id

    const { error: linkError } = await admin
      .from('transport_assignments')
      .update({ boarding_pass_document_id: docId })
      .eq('id', safeAssignmentId)
      .eq('tour_id', tourId)

    if (linkError) return { error: linkError.message }
  }

  // Enqueue the send job, 3h before departure or immediately.
  await scheduleBoardingPassSend(safeAssignmentId, tourId)

  return { error: null }
}