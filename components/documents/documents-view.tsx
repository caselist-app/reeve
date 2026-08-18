'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { DocumentCard } from '@/components/documents/document-card'
import { DOC_SECTIONS, sectionForDocType } from '@/lib/documents/doc-types'
import type { DocumentRow, DocumentShareRow, OlderVersionRow } from '@/lib/documents/queries'

interface Props {
  documents: DocumentRow[]
  shares: Record<string, DocumentShareRow[]>
  olderVersions: Record<string, OlderVersionRow[]>
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
  archivedDocuments,
  sharesError,
  olderVersionsError,
  archivedDocumentsError,
  error,
}: Props) {
  const [archivedExpanded, setArchivedExpanded] = useState(false)

  if (error) {
    return <p className="text-sm text-destructive">Could not load documents.</p>
  }

  if (documents.length === 0 && archivedDocuments.length === 0 && !archivedDocumentsError) {
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
                archived={false}
                shares={shares[doc.id] ?? []}
                sharesError={sharesError}
                olderVersions={olderVersions[doc.doc_type] ?? []}
                olderVersionsError={olderVersionsError}
              />
            ))}
          </div>
        </div>
      ))}

      {archivedDocumentsError && (
        <p className="text-sm text-destructive">Could not load archived documents.</p>
      )}

      {archivedDocuments.length > 0 && (
        <div className="border-t border-border pt-6">
          <button
            type="button"
            onClick={() => setArchivedExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            Archived ({archivedDocuments.length})
            {archivedExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {archivedExpanded && (
            <div className="mt-3 space-y-2">
              {archivedDocuments.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  archived={true}
                  shares={shares[doc.id] ?? []}
                  sharesError={sharesError}
                  olderVersions={olderVersions[doc.doc_type] ?? []}
                  olderVersionsError={olderVersionsError}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
