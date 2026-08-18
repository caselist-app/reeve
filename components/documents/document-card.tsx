import { ListRow } from '@/components/ui/list-row'
import { DocumentTitle } from '@/components/documents/document-title'
import { ShareLog } from '@/components/documents/share-log'
import { OlderVersions } from '@/components/documents/older-versions'
import type { DocumentRow, DocumentShareRow, OlderVersionRow } from '@/lib/documents/queries'

interface Props {
  document: DocumentRow
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
  shares,
  sharesError,
  olderVersions,
  olderVersionsError,
}: Props) {
  return (
    <ListRow className="flex flex-col items-stretch gap-3 text-left">
      <DocumentTitle documentId={document.id} title={document.title} />
      <ShareLog shares={shares} error={sharesError} />
      <OlderVersions versions={olderVersions} error={olderVersionsError} />
    </ListRow>
  )
}
