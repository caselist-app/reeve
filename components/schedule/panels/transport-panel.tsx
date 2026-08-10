'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFlightNumber } from '@/lib/utils/format-flight-number'
import { placeName } from '@/lib/utils/place-name'
import { PanelShell } from '@/components/layout/panel-shell'
import { AirlineLogo } from '@/components/schedule/airline-logo'
import { Input } from '@/components/ui/input'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { StatusBadge, TRANSPORT_VARIANT } from '@/components/ui/status-badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { updateTransportSegment, deleteTransportSegment } from '@/lib/actions/transport'
import { useSidePanel } from '@/stores/side-panel-store'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'
import type { Tables } from '@/lib/types/database'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/schedule/datetime'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'

type Segment = Pick<
  Tables<'transport_segments'>,
  | 'id' | 'mode' | 'origin' | 'destination' | 'depart_at' | 'arrive_at'
  | 'carrier_operator' | 'vehicle_or_flight_no' | 'booking_reference' | 'status'
  | 'origin_iata' | 'destination_iata' | 'flight_status'
  | 'actual_depart_at' | 'actual_arrive_at' | 'gate' | 'terminal' | 'last_tracked_at'
>

interface TransportPanelProps {
  segment: Segment
  timezone: string
}

const MODE_LABELS: Record<string, string> = {
  flight: 'Flight',
  rail:   'Train',
  bus:    'Coach',
  truck:  'Truck',
  ground: 'Ground',
  hire:   'Hire car',
}

// Just the time, for the compact departure/arrival row.
function formatTimeOnly(iso: string | null, tz: string): string {
  if (!iso) return '--:--'
  return new Date(iso).toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
}

// Just the date, shown instead of a live status when the flight isn't being
// tracked yet (mirrors the grey/scheduled state in the Add Flight flow).
function formatDateOnly(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
}

// standalone: true means the label is already a complete statement ("Landed",
// "Cancelled") and shouldn't be prefixed with "Departs " the way "On Time" /
// "Delayed" are ("Departs On Time" reads fine, "Departs Landed" doesn't).
const FLIGHT_STATUS_TEXT: Record<string, { label: string; className: string; standalone?: boolean }> = {
  scheduled: { label: 'On Time', className: 'text-green-600' },
  delayed:   { label: 'Delayed', className: 'text-amber-600' },
  cancelled: { label: 'Cancelled', className: 'text-red-600', standalone: true },
  departed:  { label: 'Departed', className: 'text-blue-600', standalone: true },
  landed:    { label: 'Landed', className: 'text-green-600', standalone: true },
}

function DeleteMenu({ segmentId, modeLabel }: { segmentId: string; modeLabel: string }) {
  const router = useRouter()
  const { close } = useSidePanel()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteTransportSegment(segmentId)
    setDeleting(false)
    if (result.error) { setError(result.error); return }
    setOpen(false)
    close()
    router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Segment options"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => setOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            Delete {modeLabel.toLowerCase()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {modeLabel.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the day. This cannot be undone.
              {error && <span className="mt-2 block text-destructive">{error}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Booking reference is the only field on a flight segment the TM hand-enters
// after booking off-platform (Brief 31's Add Flight flow, step 5). Everything
// else on a flight comes from AirLabs and is display-only here: editing a
// carrier/time/route by hand would drift silently from what's actually being
// tracked, with nothing to reconcile it back.
function BookingReferenceField({ segment }: { segment: Segment }) {
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(segment.booking_reference ?? '')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      await updateTransportSegment(segment.id, { booking_reference: value || null })
      setSaved(true)
    })
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs">Booking reference</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false) }}
          placeholder="ABC123"
          className="h-7 text-xs"
        />
        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={pending} onClick={handleSave}>
          {pending ? 'Saving...' : 'Save'}
        </Button>
      </div>
      {saved && <p className="text-[11px] text-muted-foreground">Saved.</p>}
    </div>
  )
}

function FlightCard({ segment, timezone }: { segment: Segment; timezone: string }) {
  const flightIataCode = segment.vehicle_or_flight_no?.match(/^([A-Za-z]{2,3})\d+/)?.[1]?.toUpperCase() ?? null
  // last_tracked_at is only ever stamped when the AirLabs lookup's own date
  // matched the TM's chosen date (see add-flight-form.tsx) or once the live
  // tracking job (Brief 31, Commit 6) has polled it - so its presence is the
  // signal that flight_status/gate/terminal are real, not a stale guess.
  const isLive = !!segment.last_tracked_at

  const statusInfo = isLive && segment.flight_status ? FLIGHT_STATUS_TEXT[segment.flight_status] : null
  const originPlace = placeName(segment.origin, segment.origin_iata)
  const destinationPlace = placeName(segment.destination, segment.destination_iata)
  const gateTerminal = [
    segment.terminal ? `Terminal ${segment.terminal}` : null,
    segment.gate ? `Gate ${segment.gate}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-medium leading-none text-muted-foreground">
            <AirlineLogo iataCode={flightIataCode} size="s" className="h-4 w-4" />
            {formatFlightNumber(segment.vehicle_or_flight_no)}
          </span>
          {statusInfo ? (
            <span className="text-xs">
              {!statusInfo.standalone && <span className="text-muted-foreground">Departs </span>}
              <span className={cn(
                'font-semibold',
                statusInfo.className,
                statusInfo.standalone && 'text-[11px]'
              )}>
                {statusInfo.label}
              </span>
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{formatDateOnly(segment.depart_at, timezone)}</span>
          )}
        </div>

        <p className="mt-2 text-sm font-semibold">
          {originPlace} to {destinationPlace}
        </p>

        <div className="mt-2 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full',
              isLive ? 'bg-green-500/10 text-green-600' : 'bg-muted-foreground/10 text-muted-foreground'
            )}>
              <ArrowUpRight className="h-3 w-3" />
            </span>
            <span className="text-muted-foreground">{segment.origin_iata}</span>
            <span className={cn('font-bold', isLive ? 'text-green-600' : 'text-foreground')}>
              {formatTimeOnly(segment.depart_at, timezone)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full',
              isLive ? 'bg-green-500/10 text-green-600' : 'bg-muted-foreground/10 text-muted-foreground'
            )}>
              <ArrowDownRight className="h-3 w-3" />
            </span>
            <span className="text-muted-foreground">{segment.destination_iata}</span>
            <span className={cn('font-bold', isLive ? 'text-green-600' : 'text-foreground')}>
              {formatTimeOnly(segment.arrive_at, timezone)}
            </span>
          </span>
        </div>

        {gateTerminal && <p className="mt-2 text-[11px] text-muted-foreground">{gateTerminal}</p>}

        {!isLive && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Live status, gate, and terminal appear automatically once the flight is close enough to track.
          </p>
        )}
      </div>

      <BookingReferenceField segment={segment} />

      <div className="space-y-1">
        <Label className="text-xs">Booking status</Label>
        <div>
          <StatusBadge
            label={segment.status}
            variant={TRANSPORT_VARIANT[segment.status] ?? 'default'}
          />
        </div>
      </div>
    </div>
  )
}

function EditableSegmentForm({ segment, timezone }: { segment: Segment; timezone: string }) {
  // The day the segment is on now, in the same frame the input renders: the
  // tour-local calendar date of its departure. Comparing against the UTC date
  // would warn about a move that is not one, and miss one that is, on any tour
  // not on UTC.
  const currentLocalDate = toDatetimeLocal(segment.depart_at, timezone).slice(0, 10)
  const [departLocal, setDepartLocal] = useState(toDatetimeLocal(segment.depart_at, timezone))
  // Controlled so the Places widget can write the selected place back in.
  const [origin, setOrigin] = useState(segment.origin ?? '')
  const [destination, setDestination] = useState(segment.destination ?? '')

  const { submit, pending, error, saved } = useEntityForm({
    action: (fd) => {
      const data = readForm(fd, {
        origin: 'string',
        destination: 'string',
        depart_at: 'string',
        arrive_at: 'string',
        carrier_operator: 'string',
        vehicle_or_flight_no: 'string',
        booking_reference: 'string',
      })
      return updateTransportSegment(segment.id, {
        origin: data.origin,
        destination: data.destination,
        depart_at: fromDatetimeLocal(data.depart_at, timezone),
        arrive_at: fromDatetimeLocal(data.arrive_at, timezone),
        carrier_operator: data.carrier_operator,
        vehicle_or_flight_no: data.vehicle_or_flight_no,
        booking_reference: data.booking_reference,
      })
    },
  })

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <PlacesAddressInput
            name="origin"
            value={origin}
            onChange={setOrigin}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <PlacesAddressInput
            name="destination"
            value={destination}
            onChange={setDestination}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Departs</Label>
          <Input
            name="depart_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(segment.depart_at, timezone)}
            onChange={(e) => setDepartLocal(e.target.value)}
            className="h-7 text-xs"
          />
          {/* The departure decides which day a segment is on, so this is the
              field that moves it. Bug 1c was the hardest of the three to spot
              because the segment used to stay put and show the new time. */}
          <DateMoveNotice currentDate={currentLocalDate} value={departLocal} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Arrives</Label>
          <Input
            name="arrive_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(segment.arrive_at, timezone)}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Carrier</Label>
          <Input name="carrier_operator" defaultValue={segment.carrier_operator ?? ''} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Flight / ref</Label>
          <Input name="vehicle_or_flight_no" defaultValue={segment.vehicle_or_flight_no ?? ''} className="h-7 text-xs" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Booking reference</Label>
        <Input name="booking_reference" defaultValue={segment.booking_reference ?? ''} className="h-7 text-xs" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <div>
          <StatusBadge label={segment.status} variant={TRANSPORT_VARIANT[segment.status] ?? 'default'} />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending} className="w-full">
        {pending ? 'Saving...' : 'Save'}
      </Button>
      {saved && <p className="text-xs text-muted-foreground text-center">Saved.</p>}
    </form>
  )
}

export function TransportPanel({ segment, timezone }: TransportPanelProps) {
  const modeLabel = MODE_LABELS[segment.mode] ?? segment.mode

  return (
    <PanelShell
      title={modeLabel}
      description={
        segment.mode === 'flight'
          ? undefined
          : [segment.origin, segment.destination].filter(Boolean).join(' to ') || undefined
      }
      headerAction={<DeleteMenu segmentId={segment.id} modeLabel={modeLabel} />}
    >
      {segment.mode === 'flight' ? (
        <FlightCard segment={segment} timezone={timezone} />
      ) : (
        <EditableSegmentForm segment={segment} timezone={timezone} />
      )}
    </PanelShell>
  )
}
