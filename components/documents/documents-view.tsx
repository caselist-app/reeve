import { DocumentCard } from '@/components/documents/document-card'
import { DOC_SECTIONS, sectionForDocType } from '@/lib/documents/doc-types'
import type { DocumentRow, DocumentShareRow, OlderVersionRow } from '@/lib/documents/queries'

interface Props {
  documents: DocumentRow[]
  shares: Record<string, DocumentShareRow[]>
  olderVersions: Record<string, OlderVersionRow[]>
  // Not yet rendered: no archive UI exists on this view yet. Carried through
  // the props so the data is available once that UI lands.
  archivedDocuments: DocumentRow[]
  sharesError: string | null
  olderVersionsError: string | null
  archivedDocumentsError: string | null
  error: string | null
}

export function DocumentsView({
  documents,
  shares,
  olderVersions,
  sharesError,
  olderVersionsError,
  error,
}: Props) {
  if (error) {
    return <p className="text-sm text-destructive">Could not load documents.</p>
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents yet.</p>
  }

  const grouped = new Map<string, DocumentRow[]>()
  for (const doc of documents) {
    const section = sectionForDocType(doc.doc_type)
    const bucket = grouped.get(section.docType) ?? []
    bucket.push(doc)
    grouped.set(section.docType, bucket)
  }

  const sections = DOC_SECTIONS.filter((section) => grouped.get(section.docType)?.length)

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <div key={section.docType}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            {section.label}
          </p>
          <div className="space-y-2">
            {grouped.get(section.docType)!.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                shares={shares[doc.id] ?? []}
                sharesError={sharesError}
                olderVersions={olderVersions[doc.doc_type] ?? []}
                olderVersionsError={olderVersionsError}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
