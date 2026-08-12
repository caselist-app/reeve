'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { discardExtraction } from '@/lib/actions/extractions'
import { useSidePanel } from '@/stores/side-panel-store'
import { useInboxCountStore, selectOpenCount } from '@/stores/inbox-count-store'
import { Button } from '@/components/ui/button'
import type { ExtractionSubject } from '@/lib/inbox/item'

interface Props {
  subject: ExtractionSubject
}

function decrementInboxCount() {
  const { serverCount, override, setOverride } = useInboxCountStore.getState()
  const current = selectOpenCount(serverCount, override)
  setOverride(serverCount, current - 1)
}

function rowCountLine(subject: ExtractionSubject): string | null {
  const counts = [
    subject.proposal.shows.length && `${subject.proposal.shows.length} show${subject.proposal.shows.length === 1 ? '' : 's'}`,
    subject.proposal.transport_segments.length &&
      `${subject.proposal.transport_segments.length} transport segment${subject.proposal.transport_segments.length === 1 ? '' : 's'}`,
    subject.proposal.hotel_stays.length &&
      `${subject.proposal.hotel_stays.length} hotel stay${subject.proposal.hotel_stays.length === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return counts.length > 0 ? counts.join(', ') : null
}

// The extraction detail view (brief 53, REE-154): the forwarded email itself,
// plus, once extraction has finished, an entry point into the row review
// panel (extraction-rows-panel.tsx) where the TM keeps or discards each
// proposed row. This view never writes to the spine itself: confirming or
// discarding the whole email both happen from the panel or from the Discard
// button here, both of which resolve the Inbox row through their own action,
// never from this component directly (same shape as guest-request-item.tsx).
export function ExtractionItem({ subject }: Props) {
  const router = useRouter()
  const { open } = useSidePanel()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const countLine = rowCountLine(subject)
  const resolved = subject.status === 'confirmed'

  function reviewRows() {
    open({
      type: 'extraction-rows',
      forwardedEmailId: subject.forwardedEmailId,
      subjectLine: subject.subjectLine,
      proposal: subject.proposal,
    })
  }

  function discard() {
    setError(null)
    startTransition(async () => {
      const result = await discardExtraction(subject.forwardedEmailId)
      if (result.error) {
        setError(result.error)
        return
      }
      decrementInboxCount()
      router.push('/inbox')
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 text-sm">
          <span className="text-muted-foreground">From</span>
          <span className="text-right font-medium">{subject.fromAddress ?? 'Unknown sender'}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 text-sm">
          <span className="text-muted-foreground">Subject</span>
          <span className="text-right font-medium">{subject.subjectLine ?? '(no subject)'}</span>
        </div>
        {subject.bodyText ? (
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words pt-1 text-sm text-foreground">
            {subject.bodyText}
          </pre>
        ) : (
          <p className="pt-1 text-sm text-muted-foreground">This email arrived with no readable body.</p>
        )}
      </div>

      {resolved && <p className="text-sm text-muted-foreground">This extraction was already confirmed.</p>}

      {!resolved && subject.status === 'failed' && (
        <p className="text-sm text-destructive">
          Extraction failed. Discard this email and forward it again, or contact support.
        </p>
      )}

      {!resolved && subject.status === 'extracted' && (
        <p className="text-sm text-muted-foreground">
          {countLine ? `Found ${countLine}.` : 'No structured data was found in this email.'}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!resolved && (
        <div className="flex items-center gap-3">
          {subject.status === 'extracted' && countLine && (
            <Button type="button" disabled={pending} onClick={reviewRows}>
              Review rows
            </Button>
          )}
          <Button type="button" variant="outline" disabled={pending} onClick={discard}>
            {pending ? 'Discarding...' : 'Discard'}
          </Button>
        </div>
      )}
    </div>
  )
}
