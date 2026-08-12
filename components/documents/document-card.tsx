import { ListRow } from '@/components/ui/list-row'
import { ShareLog } from '@/components/documents/share-log'
import type { DocumentRow, DocumentShareRow } from '@/lib/documents/queries'

interface Props {
  document: DocumentRow
  shares: DocumentShareRow[]
  sharesError: string | null
}

// One document plus its full share log: who it went to, when it was sent,
// opened and acknowledged, and whether a reminder has gone out. Read-only:
// sending happens from the show advance panel (components/shows/
// advance-documents.tsx); this card is where a TM checks what already went out.
export function DocumentCard({ document, shares, sharesError }: Props) {
  return (
    <ListRow className="flex flex-col items-stretch gap-3 text-left">
      <p className="truncate text-sm font-medium">{document.title}</p>
      <ShareLog shares={shares} error={sharesError} />
    </ListRow>
  )
}
