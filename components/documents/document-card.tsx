import { ListRow } from '@/components/ui/list-row'
import { DocumentTitle } from '@/components/documents/document-title'
import { ArchiveDocumentButton } from '@/components/documents/archive-document-button'
import { ShareLog } from '@/components/documents/share-log'
import { OlderVersions } from '@/components/documents/older-versions'
import type { DocumentRow, DocumentShareRow, OlderVersionRow } from '@/lib/documents/queries'

interface Props {
  document: DocumentRow
  archived: boolean
  shares: DocumentShareRow[]
  sharesError: string | null
  olderVersions: OlderVersionRow[]
  olderVersionsError: string | null
}

// One document plus its full share log: who it went to, when it was sent,
// opened and acknowledged, and whether a reminder has gone out. Read-only:
// sending happens from the show advance panel (components/shows/
// advance-documents.tsx); this card is where a TM checks what already went out.
export function DocumentCard({
  document,
  archived,
  shares,
  sharesError,
  olderVersions,
  olderVersionsError,
}: Props) {
  return (
    <ListRow className="flex flex-col items-stretch gap-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <DocumentTitle documentId={document.id} title={document.title} />
        </div>
        <ArchiveDocumentButton documentId={document.id} title={document.title} archived={archived} />
      </div>
      <ShareLog shares={shares} error={sharesError} />
      <OlderVersions versions={olderVersions} error={olderVersionsError} />
    </ListRow>
  )
}
