import type { Tables } from '@/lib/types/database'
import { expiryStatus, formatExpiry } from '@/lib/roster/expiry'
import { identityDocumentLabel, mimeLabel, formatFileSize } from '@/lib/identity/kinds'
import { ListRow } from '@/components/ui/list-row'
import { StatusBadge, PASSPORT_VARIANT } from '@/components/ui/status-badge'

interface Props {
  documents: Tables<'identity_documents'>[]
}

// ListRow only tints danger/warning; 'none' and 'ok' render no severity, the
// same absence PASSPORT_VARIANT already encodes for the badge.
const PASSPORT_SEVERITY = {
  expired: 'danger',
  soon: 'warning',
} as const

// Country is issuing_country for a passport, valid_for_country for a visa.
// Number is document_number for a passport, visa_type for a visa. Any of the
// three being null just drops from the line rather than leaving a gap.
function lineOne(doc: Tables<'identity_documents'>): string {
  const country = doc.kind === 'visa' ? doc.valid_for_country : doc.issuing_country
  const number = doc.kind === 'visa' ? doc.visa_type : doc.document_number
  return [identityDocumentLabel(doc.kind), country, number].filter(Boolean).join('  ')
}

// The read-only Identity section: query and sort happen in getContact, this
// renders what it's handed. The [...] menu (view scan, set primary, edit,
// delete) and the add-document flow are write-path work for a later slice.
export function IdentityDocuments({ documents }: Props) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No passport or visa on file.</p>
  }

  return (
    <div className="space-y-1.5">
      {documents.map((doc) => {
        const status = expiryStatus(doc.expiry_date)
        const severity = status === 'expired' || status === 'soon' ? PASSPORT_SEVERITY[status] : undefined

        return (
          <ListRow key={doc.id} severity={severity} className="flex flex-col gap-1 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{lineOne(doc)}</span>
              {doc.is_primary && <StatusBadge label="Primary" variant="default" />}
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              {doc.expiry_date ? (
                <>
                  <span>Expires {formatExpiry(doc.expiry_date)}</span>
                  {(status === 'soon' || status === 'expired') && (
                    <StatusBadge
                      label={status === 'expired' ? 'Expired' : 'Soon'}
                      variant={PASSPORT_VARIANT[status]}
                    />
                  )}
                </>
              ) : (
                <span>No expiry recorded</span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {mimeLabel(doc.mime_type)}, {formatFileSize(doc.byte_size)}
            </p>
          </ListRow>
        )
      })}
    </div>
  )
}
