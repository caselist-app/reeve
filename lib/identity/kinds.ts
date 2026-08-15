// Brief 45. The kind list for identity_documents, and the small amount of
// display logic that reads off it: label lookup, the ordering the Identity
// section renders in, and the mime/size formatting for the row's third line.
//
// Matches the identity_documents check constraint exactly (kind in
// ('passport', 'visa')). Nothing checks this pair the way
// scripts/check-conventions.mjs rule 10 checks day_items against its
// constraint, so adding a kind here without a matching migration is a build
// that passes and a row that 500s on write.

export interface IdentityDocumentKind {
  kind: string
  label: string
}

// Order is load-bearing: sortIdentityDocuments ranks by position in this
// list, so passports before visas falls out of the array order rather than a
// separate rule.
export const IDENTITY_DOCUMENT_KINDS: readonly IdentityDocumentKind[] = [
  { kind: 'passport', label: 'Passport' },
  { kind: 'visa', label: 'Visa' },
]

const BY_KIND = new Map(IDENTITY_DOCUMENT_KINDS.map((k) => [k.kind, k]))

function kindOrder(kind: string): number {
  const index = IDENTITY_DOCUMENT_KINDS.findIndex((k) => k.kind === kind)
  return index === -1 ? IDENTITY_DOCUMENT_KINDS.length : index
}

/**
 * A kind's label, or the raw kind if it is unknown. The raw kind is
 * deliberately ugly on screen, the same reasoning as dayItemLabel: a kind
 * missing from this list is a bug, not something to tidy up quietly.
 */
export function identityDocumentLabel(kind: string): string {
  return BY_KIND.get(kind)?.label ?? kind
}

interface SortableDocument {
  kind: string
  is_primary: boolean
  expiry_date: string | null
}

/**
 * Primary first, then by expiry_date ascending, passports before visas.
 * A null expiry sorts after every dated record of the same kind: it is the
 * least urgent state, not the most, since there is nothing to chase yet.
 */
export function sortIdentityDocuments<T extends SortableDocument>(documents: T[]): T[] {
  return [...documents].sort((a, b) => {
    const kindDiff = kindOrder(a.kind) - kindOrder(b.kind)
    if (kindDiff !== 0) return kindDiff

    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1

    if (a.expiry_date === b.expiry_date) return 0
    if (a.expiry_date === null) return 1
    if (b.expiry_date === null) return -1
    return a.expiry_date < b.expiry_date ? -1 : 1
  })
}

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
}

export function mimeLabel(mimeType: string): string {
  return MIME_LABELS[mimeType] ?? mimeType
}

/** One decimal place in MB above 1 MB, whole KB below. */
export function formatFileSize(bytes: number): string {
  const kb = bytes / 1024
  if (kb > 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${Math.round(kb)} KB`
}
