'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { PanelShell } from '@/components/layout/panel-shell'
import { PanelDeleteMenu } from '@/components/schedule/panels/panel-delete-menu'
import { ShowForm } from '@/components/shows/show-form'
import { Button } from '@/components/ui/button'
import {
  getShowVenueDetail,
  previewShowRemoval,
  deleteShowAndResend,
  retryHubResolution,
  type ShowVenueDetail,
  type ShowRemovalPreview,
} from '@/lib/actions/shows'
import { useSidePanel } from '@/stores/side-panel-store'
import type { Show } from '@/lib/validators/show'

interface VenuePanelProps {
  tourId: string
  showId: string
  venueName: string
}

// How long to keep polling for a hub resolution before giving up. Generous
// relative to a typical geocode (a few seconds); the Retry button below is
// the fallback for a resolution that is genuinely stuck rather than merely
// slow, so this does not need to run forever.
const HUB_POLL_INTERVAL_MS = 4000
const HUB_POLL_MAX_ATTEMPTS = 20

// The show, minus its running order. Address, capacity, stage, power, dressing
// rooms, house spec, catering type, and the way into the advance, the planner
// and the hotel search. Until Brief 36 step 6 this lived on the show page's
// Venue tab and was editable nowhere else in the product, which is the thing
// that made deleting that page bigger than the brief said it was.
//
// BRIEF 42 MOVED FOUR THINGS HERE, and it is worth saying why rather than
// leaving it to a diff. The show panel used to own the day sheet's twenty time
// fields AND the advance link, the two planner links and delete show. Once a
// day's times are rows, the timeline opens one item at a time and nothing opens
// the show panel any more. Those four had to land somewhere or they would have
// become unreachable, which for the advance means a TM can no longer see which
// riders are out. This is where a TM already is when they want them: the venue
// block in day info is the one route into a show.
//
// Loads on open rather than being handed its data, because the day view would
// otherwise fetch a dozen venue columns on every date click to feed a panel a TM
// opens occasionally. components/roster/contact-panel.tsx is the same shape.
export function VenuePanel({ tourId, showId, venueName }: VenuePanelProps) {
  const router = useRouter()
  const { open, close } = useSidePanel()
  const [detail, setDetail] = useState<ShowVenueDetail | null>(null)
  const [removal, setRemoval] = useState<ShowRemovalPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const hubPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (hubPollRef.current) clearInterval(hubPollRef.current)
    }
  }, [])

  // Polls getShowVenueDetail until hub_resolved_at lands, then refreshes so
  // the venue's map appears on the day view without a manual reload. Shared
  // by the two paths that queue resolveHubJob (Trigger.dev) and have no other
  // way to learn when it finishes: a save that changes the address, and a
  // manual Retry. That job writes the geocode via the admin client, outside
  // any Next.js request, so nothing tells the schedule route's Router Cache
  // to refetch on its own. REE-227.
  function pollUntilHubResolved() {
    if (hubPollRef.current) clearInterval(hubPollRef.current)
    let attempts = 0
    hubPollRef.current = setInterval(() => {
      attempts += 1
      getShowVenueDetail(showId).then(({ data: polled }) => {
        if (!polled) return
        if (polled.hubResolvedAt) {
          setDetail(polled)
          if (hubPollRef.current) clearInterval(hubPollRef.current)
          router.refresh()
        } else if (attempts >= HUB_POLL_MAX_ATTEMPTS && hubPollRef.current) {
          clearInterval(hubPollRef.current)
        }
      })
    }, HUB_POLL_INTERVAL_MS)
  }

  // ShowForm's own save (address, or anything else) does not otherwise reach
  // this panel: the form only reports up whether a show id came back.
  // Refetch this panel's own detail, which also clears or shows the banner
  // above without waiting for a reopen, and start polling if it is still
  // unresolved.
  function handleSaved() {
    getShowVenueDetail(showId).then(({ data }) => {
      if (!data) return
      setDetail(data)
      if (!data.hubResolvedAt) pollUntilHubResolved()
    })
  }

  // Re-enqueues the same resolve-hub job the address-change path already
  // uses. A stuck resolution and one that is genuinely still in flight look
  // identical from here (hub_resolved_at null either way), so this is safe
  // to offer any time the banner is showing rather than only once we know it
  // failed. REE-216: without this, a permanently failed resolution (a
  // missing GOOGLE_MAPS_API_KEY, a bad address, a geocode with no results)
  // never retries unless the TM happens to edit the address again.
  async function handleRetry() {
    setRetrying(true)
    const result = await retryHubResolution(showId)
    setRetrying(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast('Retrying venue location.', {
      description: 'This can take a moment. The map appears here once it resolves.',
    })
    pollUntilHubResolved()
  }

  async function handleDelete(): Promise<string | null> {
    // resend is false because the "send the day again" checkbox is not rendered:
    // its callable day send is Brief 48 (Send The Day Again), which has not
    // landed. A disabled checkbox would teach a TM the feature is broken rather
    // than coming, so it is left out until then, and this passes false.
    const result = await deleteShowAndResend(showId, { resend: false })
    if (result.error) return result.error
    close()
    router.refresh()
    return null
  }

  useEffect(() => {
    let cancelled = false

    // Two independent reads on open: the venue form's data, and the counted facts
    // the removal dialog states. Fetched together so the dialog has its counts
    // ready by the time the TM reaches for the options menu.
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

    previewShowRemoval(showId)
      .then((preview) => {
        if (!cancelled) setRemoval(preview)
      })
      .catch(() => {
        // Leave removal null: the dialog falls back to copy that is true without
        // the counts, so the delete still works.
      })

    return () => {
      cancelled = true
    }
  }, [showId])

  // The removal dialog's copy, in counted facts. Line 1 names what goes; line 2
  // states what the day becomes. If the preview is missing (still loading, or a
  // failed read), fall back to copy that is true without the counts: the counts
  // are a nicety, the delete is not, and a TM must never be blocked from removing
  // a show because a count query failed.
  function removalDescription(): React.ReactNode {
    const removes = `This removes ${venueName} and its advance status.`

    if (!removal || removal.error) {
      return `${removes} The day reverts to a travel day or day off. This cannot be undone.`
    }

    const n = removal.cascadingItemCount
    const cascade =
      n > 0 ? ` ${n} ${n === 1 ? 'item' : 'items'} on this day ${n === 1 ? 'goes' : 'go'} with it.` : ''
    const becomes =
      removal.fallbackDayType === 'travel'
        ? 'The day becomes a travel day.'
        : 'The day becomes a day off.'

    return `${removes}${cascade} ${becomes}`
  }

  return (
    <PanelShell
      title={venueName}
      description="Venue"
      headerAction={
        detail ? (
          <PanelDeleteMenu
            triggerLabel="Show options"
            menuLabel="Delete show"
            confirmLabel="Delete show"
            pendingLabel="Deleting..."
            dialogTitle="Delete this show?"
            dialogDescription={removalDescription()}
            onConfirm={handleDelete}
          />
        ) : undefined
      }
    >
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
              <div className="flex-1 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Resolving venue location. Travel options and the map will appear once it
                  completes. Taking a while? Retry it.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={retrying}
                  onClick={handleRetry}
                >
                  {retrying ? 'Retrying...' : 'Retry'}
                </Button>
              </div>
            </div>
          )}

          <ShowForm
            tourId={tourId}
            showId={showId}
            initialData={detail.show as Partial<Show>}
            onSaved={handleSaved}
          />

          {/* Moved off the show panel by Brief 42. Advance opens a panel; travel
              is a workspace, wide enough that it stays a full route. Find hotels
              removed for launch (REE-228): the search workspace it pointed at is
              gated, so the link would only dead-end. */}
          <div className="mt-5 space-y-1 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => open({ type: 'advance', tourId, showId, venueName })}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
            >
              Advance
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            <Link
              href={`/tours/${tourId}/shows/${showId}/planner`}
              onClick={close}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
            >
              Plan travel
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </div>
        </>
      )}
    </PanelShell>
  )
}
