'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { PanelShell } from '@/components/layout/panel-shell'
import { ShowForm } from '@/components/shows/show-form'
import { getShowVenueDetail, type ShowVenueDetail } from '@/lib/actions/shows'
import type { Show } from '@/lib/validators/show'

interface VenuePanelProps {
  tourId: string
  showId: string
  venueName: string
}

// The venue half of a show: address, capacity, stage, power, dressing rooms,
// house spec. Until Brief 36 step 6 this lived on the show page's Venue tab and
// was editable nowhere else in the product, which is the thing that made
// deleting that page bigger than the brief said it was.
//
// Loads on open rather than being handed its data, because the day view would
// otherwise fetch a dozen venue columns on every date click to feed a panel a TM
// opens occasionally. components/roster/contact-panel.tsx is the same shape.
export function VenuePanel({ tourId, showId, venueName }: VenuePanelProps) {
  const [detail, setDetail] = useState<ShowVenueDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getShowVenueDetail(showId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (data) setDetail(data)
        // A failed read says so rather than rendering an empty form. An empty
        // form here reads as "this venue has no details yet", and a TM who
        // believes that and saves has just cleared the row.
        else setFetchError(error ?? 'Could not load this venue.')
      })
      .catch(() => {
        if (!cancelled) setFetchError('Could not load this venue.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [showId])

  return (
    <PanelShell title={venueName} description="Venue">
      {loading && <p className="text-xs text-muted-foreground">Loading...</p>}

      {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}

      {detail && (
        <>
          {/* Moved here with the form it belongs to. The planner cannot rank
              anything until the venue resolves to a transport hub, and this is
              the only place that says so. */}
          {!detail.hubResolvedAt && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-border px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Resolving venue location. Travel options will appear once it completes.
              </p>
            </div>
          )}

          <ShowForm
            tourId={tourId}
            showId={showId}
            initialData={detail.show as Partial<Show>}
          />
        </>
      )}
    </PanelShell>
  )
}
