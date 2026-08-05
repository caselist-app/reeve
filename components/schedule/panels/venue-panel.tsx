'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ShowForm } from '@/components/shows/show-form'
import { getShowVenueDetail, deleteShow, type ShowVenueDetail } from '@/lib/actions/shows'
import { useSidePanel } from '@/stores/side-panel-store'
import type { Show } from '@/lib/validators/show'

interface VenuePanelProps {
  tourId: string
  showId: string
  venueName: string
}

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
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteShow(showId)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
      return
    }
    setDeleteOpen(false)
    close()
    router.refresh()
  }

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

          {/* Moved off the show panel by Brief 42. Advance opens a panel; travel
              and hotels are workspaces, wide enough that they stay full routes. */}
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

            <Link
              href={`/tours/${tourId}/shows/${showId}/hotels`}
              onClick={close}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
            >
              Find hotels
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            {deleteError && <p className="mb-2 text-xs text-destructive">{deleteError}</p>}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setDeleteOpen(true)}
            >
              Delete show
            </Button>
          </div>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this show?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes {venueName}, its running order and its advance status from the
                  tour. The day reverts to travel or day off. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? 'Deleting...' : 'Delete show'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </PanelShell>
  )
}
