import { z } from 'zod'

// Action-facing schema for identity_documents (REE-199, Brief 45 step 4).
// Every field but kind is `.nullable().optional()`, the same idiom
// lib/validators/contact.ts uses: undefined means the inline form did not
// render this input for the chosen kind (passport-only and visa-only fields
// are conditionally rendered), null means it was rendered and left empty. No
// `.default()` here either, enforced by scripts/check-conventions.mjs: a
// default would invent a value for a key the form never sent.
const optionalText = z.string().nullable().optional()

export const identityDocumentSchema = z.object({
  kind: z.enum(['passport', 'visa']),
  document_number: optionalText,
  surname: optionalText,
  given_names: optionalText,
  issuing_country: optionalText,
  valid_for_country: optionalText,
  visa_type: optionalText,
  issue_date: optionalText,
  expiry_date: optionalText,
  notes: optionalText,
})

export type IdentityDocumentForm = z.infer<typeof identityDocumentSchema>
