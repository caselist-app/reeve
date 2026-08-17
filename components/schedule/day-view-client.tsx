'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Plus, MoreHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { BottomSheet, BottomSheetClose } from '@/components/ui/bottom-sheet'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SendDayDialog } from '@/components/schedule/send-day-dialog'
import { deleteTourDate } from '@/lib/actions/tour-dates'

interface DayViewClientProps {
  timeline: ReactNode
  dayInfoPanel: ReactNode
  // Horizontal date chips, visible only on mobile (the slot is lg:hidden internally).
  dateStrip?: ReactNode
  // Compact day summary pinned to the bottom on mobile; taps open the day-info sheet.
  dayInfoDock?: ReactNode
  // Context needed for the add flow forms.
  addContext: { tourId: string; tourDateId: string; date: string; timezone: string }
  // Present when a tour date exists for the selected day.
  dayMeta: {
    tourDateId: string
    dayType: 'show' | 'rehearsal' | 'travel' | 'press' | 'day_off'
    notes: string | null
    hasShow: boolean
  } | null
}

// Edit/delete-day menu. Shared by the desktop toolbar and the mobile Day Info
// sheet so the two stay identical.
function DayOptionsMenu({
  onEdit,
  onSend,
  onDelete,
  triggerClassName,
}: {
  onEdit: () => void
  // Present only on a show day (REE-105). Absent rather than disabled on
  // every other day type: there is nothing to send.
  onSend?: () => void
  onDelete: () => void
  triggerClassName?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Day options"
          className={cn(
            'flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground',
            triggerClassName,
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onEdit}>Edit day</DropdownMenuItem>
        {onSend && <DropdownMenuItem onClick={onSend}>Send the day</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          Delete day
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// State shell for the schedule day view. Main is self-sufficient: timeline on
// the left, day info as a static block on the right, neither ever swaps.
// Detail and add forms open in the global side panel instead. Only this
// component is a client component; the slots remain Server Components.
export function DayViewClient({ timeline, dayInfoPanel, dateStrip, dayInfoDock, addContext, dayMeta }: DayViewClientProps) {
  const { open: openSidePanel } = useSidePanel()
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sendDayDialogOpen, setSendDayDialogOpen] = useState(false)
  const [dayInfoOpen, setDayInfoOpen] = useState(false)

  // REE-89: one door into a day. The '+', the '/' shortcut and the mobile FAB
  // all open the same typed day-form; the category popover and its mobile sheet
  // are gone. The form needs a day to add to, so every entry point is gated on a
  // tour date existing (addContext.tourDateId is '' when the selected day has no
  // tour_dates row yet). The Dates panel's own '+' is the door that creates a day.
  const hasDay = Boolean(addContext.tourDateId)

  function openTypedForm() {
    openSidePanel({
      type: 'day-form',
      tourId: addContext.tourId,
      tourDateId: addContext.tourDateId,
      date: addContext.date,
      timezone: addContext.timezone,
    })
  }

  // '/' opens the typed form, scoped to the day view and suppressed while a
  // field is focused so it never eats a keystroke mid-typing. Cmd+K stays the
  // global search palette; this is deliberately a separate, lighter affordance.
  useEffect(() => {
    if (!hasDay) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      event.preventDefault()
      openTypedForm()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // openTypedForm closes over addContext and openSidePanel; both are stable
    // for a given render of this day, so the id fields are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDay, addContext.tourId, addContext.tourDateId])

  function handleEditDay() {
    if (!dayMeta) return
    openSidePanel({
      type: 'edit-day',
      tourId: addContext.tourId,
      tourDateId: dayMeta.tourDateId,
      date: addContext.date,
      dayType: dayMeta.dayType,
      notes: dayMeta.notes,
      hasShow: dayMeta.hasShow,
    })
  }

  async function handleDeleteConfirm(): Promise<string | null> {
    if (!dayMeta) return null
    const result = await deleteTourDate(dayMeta.tourDateId)
    if (result.error) return result.error
    // Navigate to schedule root. The sidebar will show the next available day.
    router.push(`/tours/${addContext.tourId}/schedule`)
    return null
  }

  const toolbar = (
    <div className="flex items-center justify-end gap-1.5 px-4 lg:pr-6 pt-4 pb-1 shrink-0">
      {dayMeta && (
        <DayOptionsMenu
          onEdit={handleEditDay}
          onSend={dayMeta.dayType === 'show' ? () => setSendDayDialogOpen(true) : undefined}
          onDelete={() => setDeleteDialogOpen(true)}
          triggerClassName="h-8 w-8"
        />
      )}

      {hasDay && (
        <button
          type="button"
          onClick={openTypedForm}
          aria-label="Add to day"
          title="Add to day ( / )"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/70"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  )

  return (
    <>
      <div className="flex flex-col lg:flex-row flex-1 min-w-0 min-h-0">
        {/* Timeline: flex-1. min-h-0 so this column can shrink below its content
            and hand a bounded height down to the calendar's own scroll area,
            rather than growing to the full grid height (REE-125). Inert on
            desktop, where the parent row stretches this column's height anyway. */}
        <div className="relative flex flex-col flex-1 min-w-0 min-h-0">
          {dateStrip}
          <div className="flex-1 overflow-y-auto">
            {timeline}
          </div>

          {/* Mobile add-to-day FAB, pinned bottom-right of the timeline, above the
              dock. Opens the same typed day-form the desktop '+' does, gated on a
              day existing. Hidden via lg:hidden below, the same breakpoint the
              desktop day info column appears at, so there is no dead zone
              between this and useIsMobile's narrower JS breakpoint. */}
          {hasDay && (
            <button
              type="button"
              onClick={openTypedForm}
              aria-label="Add to day"
              className="absolute bottom-4 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 lg:hidden"
            >
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Day info dock: pinned at the bottom below lg, where the desktop day
            info column (below) is hidden. Gated on lg:hidden alone, not
            useIsMobile (which flips at 767px, not 1024px): gating this on the
            JS hook left a dead zone between 768 and 1023px where neither the
            dock nor the desktop column rendered. Tapping it opens the full day
            info sheet below. */}
        {dayInfoDock && (
          <button
            type="button"
            onClick={() => setDayInfoOpen(true)}
            aria-label="Open day info"
            className="shrink-0 w-full border-t border-border bg-muted/40 px-4 pt-2 pb-[max(0.75rem,var(--safe-bottom))] text-left lg:hidden"
          >
            <div className="mx-auto mb-1.5 h-1 w-9 rounded-full bg-border" />
            {dayInfoDock}
          </button>
        )}

        {/* Day info: static block, desktop only (mobile uses the dock + sheet).
            Never swaps for anything; detail and add forms live in the global
            side panel instead. */}
        <div className="hidden lg:flex lg:flex-col w-[320px] shrink-0 min-h-0">
          {toolbar}
          <div className="flex-1 min-h-0">
            {dayInfoPanel}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete this day?"
        description="This will permanently delete the day and everything on it: shows, rehearsals, transport, hotels, and events. This cannot be undone."
        confirmLabel="Delete day"
        pendingLabel="Deleting..."
        onConfirm={handleDeleteConfirm}
      />

      {/* Send the day confirmation (REE-105) */}
      {dayMeta && (
        <SendDayDialog
          open={sendDayDialogOpen}
          onOpenChange={setSendDayDialogOpen}
          tourId={addContext.tourId}
          tourDateId={dayMeta.tourDateId}
        />
      )}

      {/* Bottom-sheet for the day-info panel below lg (venue, guest list, notes,
          hotel). Always mounted: Radix's Dialog.Root renders nothing while
          open is false, and dayInfoOpen only ever flips true via the dock
          above, which is itself lg:hidden, so this never opens at lg+. */}
      <BottomSheet open={dayInfoOpen} onOpenChange={setDayInfoOpen} title="Day info" titleClassName="sr-only">
        <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">Day info</span>
          <div className="flex items-center gap-1">
            {dayMeta && (
              <DayOptionsMenu
                onEdit={() => { setDayInfoOpen(false); handleEditDay() }}
                onSend={
                  dayMeta.dayType === 'show'
                    ? () => { setDayInfoOpen(false); setSendDayDialogOpen(true) }
                    : undefined
                }
                onDelete={() => { setDayInfoOpen(false); setDeleteDialogOpen(true) }}
                triggerClassName="h-9 w-9"
              />
            )}
            <BottomSheetClose
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </BottomSheetClose>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {dayInfoPanel}
        </div>
      </BottomSheet>
    </>
  )
}
