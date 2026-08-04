'use client'

import { useState, type ReactNode } from 'react'
import { Plus, MoreHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as SheetPrimitive from '@radix-ui/react-dialog'
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
    // Navigate to schedule root — the sidebar will show the next available day.
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
        <SheetPrimitive.Root open={dayInfoOpen} onOpenChange={setDayInfoOpen}>
          <SheetPrimitive.Portal>
            <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <SheetPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col max-h-[80dvh] rounded-t-xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300">
              <SheetPrimitive.Title className="sr-only">Day info</SheetPrimitive.Title>
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
                  <SheetPrimitive.Close
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </SheetPrimitive.Close>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {dayInfoPanel}
              </div>
            </SheetPrimitive.Content>
          </SheetPrimitive.Portal>
        </SheetPrimitive.Root>
      )}

      {/* Mobile category picker: opened by the FAB. Choosing a category opens
          the add form in the global side panel (a full-width takeover on
          mobile), same as it does from the desktop popover. */}
      {isMobile && (
        <SheetPrimitive.Root open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetPrimitive.Portal>
            <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <SheetPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col max-h-[80dvh] rounded-t-xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300">
              <SheetPrimitive.Title className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Add to day
              </SheetPrimitive.Title>
              <div className="px-2 pb-2">
                <AddPicker onSelect={handleCategorySelect} />
              </div>
            </SheetPrimitive.Content>
          </SheetPrimitive.Portal>
        </SheetPrimitive.Root>
      )}
    </>
  )
}
