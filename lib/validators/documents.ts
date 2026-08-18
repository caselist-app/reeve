import { z } from 'zod'
import { UPLOADABLE_DOC_TYPES } from '@/lib/documents/doc-types'

// Action-facing schema for the manual document upload panel (REE-3). This is
// an insert-only action, never a partial update of an existing row, so there
// is no undefined-versus-null distinction to preserve here: both fields are
// always required from the panel.
export const uploadDocumentSchema = z.object({
  docType: z
    .string()
    .refine((v) => (UPLOADABLE_DOC_TYPES as readonly string[]).includes(v), 'Invalid document type'),
  title: z.string().trim().min(1, 'Title is required'),
})

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>

// REE-283: an advance recipient is a freeform email address, not a roster
// pick, since a venue or promoter contact is rarely crew. Used both for the
// send panel's inline validation as the TM types and for the server action's
// own re-validation of the same input.
export const recipientEmailSchema = z.string().trim().toLowerCase().email('Enter a valid email address')

export const sendDocumentRecipientsSchema = z
  .array(recipientEmailSchema)
  .min(1, 'Add at least one recipient')
