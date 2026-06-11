'use client'

import { useState, useCallback } from 'react'
import { Mail, RotateCcw, CheckCircle, Clock, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import type { SendableDocument, ContactablePerson } from './send-rider-sheet'

// A single document_shares row, shaped for the UI.
export type ShareRow = {
  id: string
  document_id: string
  document_title: string
  doc_type: string
  recipient_name: string
  sent_at: string | null
  opened_at: string | null
  acknowledged_at: string | null
}

// One department's worth of data: the doc type, the current documents, and all shares.
export type DepartmentShareData = {
  department: 'audio' | 'lighting' | 'staging' | 'hospitality'
  label: string
  docType: string
  documents: SendableDocument[]
  shares: ShareRow[]
}

interface AdvanceDocumentsProps {
  tourId: string
  showId: string
  departments: DepartmentShareData[]
  people: ContactablePerson[]
}

// Formats a timestamp as a relative human-readable string.
// Only needs rough granularity: "just now", "2h ago", "3 days ago".
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface ShareStatusProps {
  share: ShareRow
  onResend: (documentId: string) => void
}

function ShareStatus({ share, onResend }: ShareStatusProps) {
  const openedLabel = share.opened_at
    ? `Opened ${relativeTime(share.opened_at)}`
    : 'Not yet opened'

  return (
    <div className="flex items-start justify-between gap-3 pl-2 py-1.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
        {share.acknowledged_at ? (
          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
        ) : share.opened_at ? (
          <Eye className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        )}
        <span className="truncate">
          <span className="text-foreground font-medium">{share.recipient_name}</span>
          {', '}
          {share.acknowledged_at
            ? `Acknowledged ${relativeTime(share.acknowledged_at)}`
            : openedLabel}
          {share.opened_at && !share.acknowledged_at && ', Awaiting acknowledgement'}
        </span>
      </div>

      {!share.acknowledged_at && (
        <button
          type="button"
          onClick={() => onResend(share.document_id)}
          className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Resend"
        >
          <RotateCcw className="h-3 w-3" />
          Resend
        </button>
      )}
    </div>
  )
}

export function AdvanceDocuments({
  tourId,
  showId,
  departments,
  people,
}: AdvanceDocumentsProps) {
  const { open } = useSidePanel()
  const [sharesByDept, setSharesByDept] = useState<Record<string, ShareRow[]>>(
    Object.fromEntries(departments.map((d) => [d.department, d.shares]))
  )

  // Optimistically appends a new share row after a successful send.
  // The server returns immediately after enqueue; the row exists in the DB.
  function handleSent(dept: string, docType: string, documentId: string, documentTitle: string) {
    setSharesByDept((prev) => ({
      ...prev,
      [dept]: [
        ...prev[dept],
        {
          id: crypto.randomUUID(),
          document_id: documentId,
          document_title: documentTitle,
          doc_type: docType,
          recipient_name: 'Sending...',
          sent_at: new Date().toISOString(),
          opened_at: null,
          acknowledged_at: null,
        } satisfies ShareRow,
      ],
    }))
  }

  const openSendPanel = useCallback(
    (dept: DepartmentShareData) => {
      const firstDoc = dept.documents[0]
      open({
        type: 'send-rider',
        tourId,
        showId,
        departmentLabel: dept.label,
        documents: dept.documents,
        people,
        onSent: () => {
          if (firstDoc) handleSent(dept.department, dept.docType, firstDoc.id, firstDoc.title)
        },
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, tourId, showId, people]
  )

  const handleResend = useCallback(
    (dept: DepartmentShareData) => {
      // Re-open the send panel so the TM picks the recipient for resend.
      openSendPanel(dept)
    },
    [openSendPanel]
  )

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Advance documents
        </p>
      </div>

      {departments.map((dept) => {
        const shares = sharesByDept[dept.department] ?? []

        return (
          <div key={dept.department} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{dept.label}</p>
              <button
                type="button"
                onClick={() => openSendPanel(dept)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                Send to venue
              </button>
            </div>

            {shares.length === 0 ? (
              <p className="pl-2 text-xs text-muted-foreground">Not yet sent</p>
            ) : (
              <div className="space-y-0.5">
                {shares.map((share) => (
                  <ShareStatus
                    key={share.id}
                    share={share}
                    onResend={() => handleResend(dept)}
                  />
                ))}
              </div>
            )}

            <div className={cn('border-b', 'last:border-0')} />
          </div>
        )
      })}
    </div>
  )
}
