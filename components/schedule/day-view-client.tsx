'use client'

import { useState, type ReactNode } from 'react'
import { Plus, MoreHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { useSchedulePanel } from '@/stores/schedule-panel-store'
import { useSidePanel } from '@/stores/side-panel-store'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { ShowPanel } from '@/components/schedule/panels/show-panel'
import { TransportPanel } from '@/components/schedule/panels/transport-panel'
import { HotelPanel } from '@/components/schedule/panels/hotel-panel'
import { EventPanel } from '@/components/schedule/panels/event-panel'
import { AddFlow } from '@/components/schedule/add/add-flow'
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
import type { Tables } from '@/lib/types/database'

// Serializable panel data passed from the Server Component page.
// Avoids re-fetching when a card is clicked.
export interface DayPanelData {
  shows: Array<{
    id: string
    venue_name: string
    day_sheets: Pick<
      Tables<'day_sheets'>,
      | 'venue_access' | 'load_in' | 'line_check' | 'soundcheck' | 'vip'
      | 'doors' | 'support_on' | 'support_off' | 'changeover'
      | 'headliner_on' | 'headliner_off' | 'curfew' | 'load_out' | 'hotel_departure'
    > | null
  }>
  segments: Array<Pick<
    Tables<'transport_segments'>,
    | 'id' | 'mode' | 'origin' | 'destination' | 'depart_at' | 'arrive_at'
    | 'carrier_operator' | 'vehicle_or_flight_no' | 'booking_reference' | 'status'
  >>
  hotels: Array<Pick<
    Tables<'hotel_stays'>,
    | 'id' | 'name' | 'address'
    | 'check_in_date' | 'check_in_time'
    | 'check_out_date' | 'check_out_time'
    | 'wifi_network' | 'wifi_password'
  >>
  events: Array<Pick<
    Tables<'day_events'>,
    'id' | 'title' | 'starts_at' | 'ends_at' | 'location' | 'notes'
  >>
  timezone: string
}

interface DayViewClientProps {
  timeline: ReactNode
  dayInfoPanel: ReactNode
  // Horizontal date chips, visible only on mobile (the slot is lg:hidden internally).
  dateStrip?: ReactNode
  // Compact day summary pinned to the bottom on mobile; taps open the day-info sheet.
  dayInfoDock?: ReactNode
  panelData: DayPanelData
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

// State shell for the schedule day view. Holds which timeline card is active
// and swaps the right column between the day info panel and the edit panel.
// Only this component is a client component; the slots remain Server Components.
export function DayViewClient({ timeline, dayInfoPanel, dateStrip, dayInfoDock, panelData, addContext, dayMeta }: DayViewClientProps) {
  const { activeCard, setActiveCard } = useSchedulePanel()
  const { open: openSidePanel } = useSidePanel()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [popoverOpen, setPopoverOpen] = useState(false)
  // Mobile-only: the FAB opens the category picker as a bottom-sheet.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<AddCategory | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dayInfoOpen, setDayInfoOpen] = useState(false)

  function renderEditPanel() {
    if (!activeCard) return null

    switch (activeCard.type) {
      case 'show': {
        const show = panelData.shows.find((s) => s.id === activeCard.showId)
        if (!show) return null
        return (
          <ShowPanel
            showId={show.id}
            venueName={show.venue_name}
            timezone={panelData.timezone}
            daySheet={show.day_sheets}
          />
        )
      }
      case 'transport': {
        const seg = panelData.segments.find((s) => s.id === activeCard.segmentId)
        if (!seg) return null
        return <TransportPanel segment={seg} timezone={panelData.timezone} />
      }
      case 'hotel-checkin':
      case 'hotel-checkout': {
        const stay = panelData.hotels.find((h) => h.id === activeCard.stayId)
        if (!stay) return null
        return <HotelPanel stay={stay} />
      }
      case 'event': {
        const ev = panelData.events.find((e) => e.id === activeCard.eventId)
        if (!ev) return null
        return <EventPanel event={ev} timezone={panelData.timezone} />
      }
    }
  }

  const editPanel = renderEditPanel()

  function handleCategorySelect(category: AddCategory) {
    setPopoverOpen(false)
    setPickerOpen(false)
    setActiveCard(null)
    setSelectedCategory(category)
  }

  // Back from the form re-opens the picker so the user can pick a different type:
  // the popover on desktop, the picker bottom-sheet on mobile.
  function handleAddBack() {
    setSelectedCategory(null)
    if (isMobile) setPickerOpen(true)
    else setPopoverOpen(true)
  }

  function handleAddClose() {
    setSelectedCategory(null)
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

  return (
    <>
      <div className="flex flex-col lg:flex-row flex-1 min-w-0 min-h-0">
        {/* Timeline: flex-1 */}
        <div className="relative flex flex-col flex-1 min-w-0">
          {dateStrip}
          {/* Day-level actions: desktop only, floated top-right. On mobile the
              day options live in the Day Info sheet and add-to-day is the FAB. */}
          <div className="hidden lg:absolute lg:right-5 lg:top-5 z-10 lg:flex items-center gap-1.5">
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

          <div className="flex-1 overflow-y-auto lg:border-r lg:border-border">
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

        {/* Right panel: 260px fixed. Hidden on mobile, where the dock + sheet replace it. */}
        <div className="hidden lg:block w-[260px] shrink-0 overflow-y-auto">
          {selectedCategory ? (
            <AddFlow
              {...addContext}
              category={selectedCategory}
              onBack={handleAddBack}
              onClose={handleAddClose}
            />
          ) : (
            editPanel ?? dayInfoPanel
          )}
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

      {/* Bottom-sheet for the edit panel on mobile. Only mounted below lg so
          Radix focus-trapping never fires on desktop where the panel is inline. */}
      {isMobile && (
        <SheetPrimitive.Root
          open={editPanel !== null}
          onOpenChange={(open) => { if (!open) setActiveCard(null) }}
        >
          <SheetPrimitive.Portal>
            <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <SheetPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col max-h-[80dvh] rounded-t-xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300">
              <SheetPrimitive.Title className="sr-only">Edit panel</SheetPrimitive.Title>
              {/* EditPanel already has its own header + X that calls setActiveCard(null) */}
              <div className="flex-1 overflow-y-auto">
                {editPanel}
              </div>
            </SheetPrimitive.Content>
          </SheetPrimitive.Portal>
        </SheetPrimitive.Root>
      )}

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
          the add-form sheet below. */}
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

      {/* Bottom-sheet for the add flow on mobile. The FAB picker selects a
          category; the form slides up here. onBack re-opens the picker. */}
      {isMobile && (
        <SheetPrimitive.Root
          open={selectedCategory !== null}
          onOpenChange={(open) => { if (!open) handleAddClose() }}
        >
          <SheetPrimitive.Portal>
            <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <SheetPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col max-h-[90dvh] rounded-t-xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300">
              <SheetPrimitive.Title className="sr-only">Add to day</SheetPrimitive.Title>
              <div className="flex-1 overflow-y-auto">
                {selectedCategory && (
                  <AddFlow
                    {...addContext}
                    category={selectedCategory}
                    onBack={handleAddBack}
                    onClose={handleAddClose}
                  />
                )}
              </div>
            </SheetPrimitive.Content>
          </SheetPrimitive.Portal>
        </SheetPrimitive.Root>
      )}
    </>
  )
}
