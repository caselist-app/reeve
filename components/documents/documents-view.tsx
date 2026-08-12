import { ListRow } from '@/components/ui/list-row'
import { DOC_SECTIONS, sectionForDocType } from '@/lib/documents/doc-types'
import type { DocumentRow } from '@/lib/documents/queries'

interface Props {
  documents: DocumentRow[]
  error: string | null
}

// The Documents page shell (REE-1). Cards render titles only at this stage:
// no share log, no upload, no detail view yet.
export function DocumentsView({ documents, error }: Props) {
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
              <ListRow key={doc.id}>
                <p className="text-sm font-medium truncate">{doc.title}</p>
              </ListRow>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
