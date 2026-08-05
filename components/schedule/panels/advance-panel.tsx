'use client'

import { useEffect, useState } from 'react'
import { PanelShell } from '@/components/layout/panel-shell'
import { AdvanceTracker } from '@/components/shows/advance-tracker'
import { AdvanceDocuments } from '@/components/shows/advance-documents'
import { getShowAdvance, type ShowAdvanceDetail } from '@/lib/actions/shows'

interface AdvancePanelProps {
  tourId: string
  showId: string
  venueName: string
}

// The advance for one show: where each department stands, and what has been
// sent to the venue.
//
// One panel with two sections rather than two panels (Matt, 2026-08-05). A TM
// checking the advance wants both answers at once: whether audio is done, and
// whether the audio rider was actually opened. Splitting them makes the second
// question a separate trip.
//
// Loads on open. Four queries feed this, and the day view would be running all
// four on every date click to fill a panel a TM opens a few times a week.
export function AdvancePanel({ tourId, showId, venueName }: AdvancePanelProps) {
  const [detail, setDetail] = useState<ShowAdvanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getShowAdvance(tourId, showId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (data) setDetail(data)
        // Never an empty panel on a failed read. "No riders on this tour" is a
        // confident, plausible, wrong answer, and it is the one a TM would act
        // on by sending nothing.
        else setFetchError(error ?? 'Could not load the advance for this show.')
      })
      .catch(() => {
        if (!cancelled) setFetchError('Could not load the advance for this show.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tourId, showId])

  return (
    <PanelShell title={venueName} description="Advance">
      {loading && <p className="text-xs text-muted-foreground">Loading...</p>}

      {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}

      {detail && (
        <div className="space-y-6">
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </p>
            <AdvanceTracker showId={showId} initialAdvance={detail.advance} />
          </section>

          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Documents
            </p>
            <AdvanceDocuments
              tourId={tourId}
              showId={showId}
              departments={detail.departments}
              people={detail.people}
            />
          </section>
        </div>
      )}
    </PanelShell>
  )
}
