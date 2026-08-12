'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { OlderVersionRow } from '@/lib/documents/queries'

interface Props {
  versions: OlderVersionRow[]
  // Distinct from an empty list: a failed read must say so rather than render
  // as "no older versions", same reasoning as ShareLog's error prop.
  error?: string | null
}

function formatUploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Collapsed by default, at the foot of the card, below the main share log.
// Expanding shows the non-current rows for this document's doc_type: title,
// version, upload date and share count. Those shares are never the ones in
// the main log above (lib/documents/queries.ts buckets by document_id, so a
// share only ever belongs to the exact version it was sent against).
export function OlderVersions({ versions, error }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>
  }

  if (versions.length === 0) return null

  return (
    <div className="border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {versions.length} older version{versions.length === 1 ? '' : 's'}
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {versions.map((version) => (
            <div
              key={version.id}
              className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{version.title}</span>
              <span className="shrink-0">v{version.version}</span>
              <span className="shrink-0">{formatUploadDate(version.created_at)}</span>
              <span className="shrink-0">
                {version.share_count} share{version.share_count === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
