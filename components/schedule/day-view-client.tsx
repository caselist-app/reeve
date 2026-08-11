'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Plus, MoreHorizontal, X, Type } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { BottomSheet, BottomSheetClose } from '@/components/ui/bottom-sheet'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { AddPicker, type AddCategory } from '@/components/schedule/add/add-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  } | null
}

// Edit/delete-day menu. Shared by the desktop toolbar and the mobile Day Info
// sheet so the two stay identical.
function DayOptionsMenu({
  onEdit,
  onDelete,
  triggerClassName,
}: {
  onEdit: () => void
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
  const isMobile = useIsMobile()
  const [popoverOpen, setPopoverOpen] = useState(false)
  // Mobile-only: the FAB opens the category picker as a bottom-sheet.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dayInfoOpen, setDayInfoOpen] = useState(false)

  // Opens the add form in the side panel. onBack closes it and reopens the
  // picker it came from, the popover on desktop or the bottom-sheet on
  // mobile, mirroring how it opened.
  function handleCategorySelect(category: AddCategory) {
    setPopoverOpen(false)
    setPickerOpen(false)
    openSidePanel({
      type: 'add-to-day',
      ...addContext,
      category,
      onBack: () => {
        if (isMobile) setPickerOpen(true)
        else setPopoverOpen(true)
      },
    })
  }

  // REE-22: the typed one-line fast path. Sits beside the '+' category picker,
  // not in place of it: typing is for anything where the time is the point, the
  // picker is for a flight, drive, rail or hotel. Both need a day to add to, so
  // both are gated on a tour date existing (addContext.tourDateId is '' when the
  // selected day has no tour_dates row yet).
  const hasDay = Boolean(addContext.tourDateId)

  function openTypedForm() {
    setPopoverOpen(false)
    setPickerOpen(false)
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
    })
  }

  async function handleDeleteConfirm() {
    if (!dayMeta) return
    setDeleting(true)
    await deleteTourDate(dayMeta.tourDateId)
    // Navigate to schedule root. The sidebar will show the next available day.
    router.push(`/tours/${addContext.tourId}/schedule`)
  }

  const toolbar = (
    <div className="flex items-center justify-end gap-1.5 px-4 pt-4 pb-1 shrink-0">
      {dayMeta && (
        <DayOptionsMenu
          onEdit={handleEditDay}
          onDelete={() => setDeleteDialogOpen(true)}
          triggerClassName="h-8 w-8"
        />
      )}

      {hasDay && (
        <button
          type="button"
          onClick={openTypedForm}
          aria-label="Type a line to add"
          title="Type a line to add ( / )"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/70"
        >
          <Type className="h-4 w-4" />
        </button>
      )}

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add to day"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/70"
          >
            <Plus className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Add to day
          </p>
          <AddPicker onSelect={handleCategorySelect} />
        </PopoverContent>
      </Popover>
    </div>
  )

  return (
    <>
      <div className="flex flex-col lg:flex-row flex-1 min-w-0 min-h-0">
        {/* Timeline: flex-1 */}
        <div className="relative flex flex-col flex-1 min-w-0">
          {dateStrip}
          <div className="flex-1 overflow-y-auto">
            {timeline}
          </div>

          {/* Mobile add-to-day FAB, pinned bottom-right of the timeline, above the dock. */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label="Add to day"
              className="absolute bottom-4 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 lg:hidden"
            >
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Mobile-only day info dock: always visible, pinned at the bottom.
            Tapping it opens the full day info sheet below. */}
        {isMobile && dayInfoDock && (
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
        <div className="hidden lg:flex lg:flex-col w-[260px] shrink-0 min-h-0">
          {toolbar}
          <div className="flex-1 min-h-0">
            {dayInfoPanel}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this day?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the day and everything on it: shows,
              rehearsals, transport, hotels, and events. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete day'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bottom-sheet for the day-info panel on mobile (venue, roster, notes). */}
      {isMobile && (
        <BottomSheet open={dayInfoOpen} onOpenChange={setDayInfoOpen} title="Day info" titleClassName="sr-only">
          <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Day info</span>
            <div className="flex items-center gap-1">
              {dayMeta && (
                <DayOptionsMenu
                  onEdit={() => { setDayInfoOpen(false); handleEditDay() }}
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
      )}

      {/* Mobile category picker: opened by the FAB. Choosing a category opens
          the add form in the global side panel (a full-width takeover on
          mobile), same as it does from the desktop popover. */}
      {isMobile && (
        <BottomSheet open={pickerOpen} onOpenChange={setPickerOpen} title="Add to day">
          <div className="px-2 pb-2">
            {/* The typed fast path, offered alongside the category picker rather
                than replacing it. Same split as desktop: type a timed item, pick
                a flight or hotel. */}
            {hasDay && (
              <button
                type="button"
                onClick={openTypedForm}
                className="mb-1 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <Type className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-1 items-baseline gap-1.5 min-w-0">
                  <span className="text-sm font-medium">Type a line</span>
                  <span className="truncate text-[11px] text-muted-foreground">load in 2pm, curfew 11...</span>
                </div>
              </button>
            )}
            <AddPicker onSelect={handleCategorySelect} />
          </div>
        </BottomSheet>
      )}
    </>
  )
}
