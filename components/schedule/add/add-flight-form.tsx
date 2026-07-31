'use client'

import { useState, useEffect, useMemo, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AirlineLogo } from '@/components/schedule/airline-logo'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createTransportSegment, updateTransportSegment } from '@/lib/actions/transport'
import { getAirlinesReference, lookupFlightForAdd } from '@/lib/actions/flight-lookup'
import { parseFlightDate, type ParsedFlightDate } from '@/lib/utils/parse-flight-date'
import type { NormalizedFlightLookup } from '@/lib/logistics/adapters/airlabs'

interface AddFlightFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  onBack: () => void
  onSuccess: () => void
}

type Airline = { iataCode: string | null; icaoCode: string | null; name: string }
type Step = 'search' | 'date' | 'card' | 'reference' | 'manual'

// Same UTC-conversion approach already used in transport-panel.tsx. Duplicated
// rather than extracted: a known, tracked duplication (Brief 27), not
// introduced by this change.
function fromDatetimeLocal(local: string | null, tz: string): string | null {
  if (!local) return null
  const ref = new Date(`${local}:00.000Z`)
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 19)
  const localAsUtc = new Date(`${localStr.replace(' ', 'T')}.000Z`)
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}

// dep_time_local / arr_time_local are "YYYY-MM-DD HH:MM"; take HH:MM.
function timeOfDay(local: string | null): string {
  return local ? local.slice(11, 16) : '00:00'
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-foreground">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

// Detects "CX150", "cx 150", "CX-150": a 2-3 letter airline code immediately
// (optionally with a space/dash) followed by digits.
function detectFlightCode(input: string): { code: string; number: string } | null {
  const m = input.trim().match(/^([A-Za-z]{2,3})\s*-?\s*(\d{1,4})$/)
  if (!m) return null
  return { code: m[1].toUpperCase(), number: m[2] }
}

function FlightChips({
  airline,
  flightNumber,
  onEditAirline,
  onFlightNumberChange,
}: {
  airline: Airline | null
  flightNumber: string
  onEditAirline: () => void
  onFlightNumberChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onEditAirline}
        className="rounded-full border border-border px-2 py-1 text-[11px] hover:bg-muted/60"
      >
        {airline?.iataCode ?? airline?.name ?? 'Airline'}
      </button>
      <Input
        value={flightNumber}
        onChange={(e) => onFlightNumberChange(e.target.value.replace(/\D/g, ''))}
        placeholder="Number"
        className="h-6 w-20 text-xs"
      />
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Departs On Time',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  departed: 'Departed',
  landed: 'Landed',
}

export function AddFlightForm({ tourId, tourDateId, date, timezone, onBack, onSuccess }: AddFlightFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('search')
  const [airlines, setAirlines] = useState<Airline[] | null>(null)
  const [query, setQuery] = useState('')

  const [airline, setAirline] = useState<Airline | null>(null)
  const [flightNumber, setFlightNumber] = useState('')

  const [dateInput, setDateInput] = useState('')
  const [parsedDate, setParsedDate] = useState<ParsedFlightDate | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const [lookup, setLookup] = useState<NormalizedFlightLookup | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [sameDateAsLookup, setSameDateAsLookup] = useState(false)

  const [segmentId, setSegmentId] = useState<string | null>(null)
  const [bookingRef, setBookingRef] = useState('')

  // Load the cached airline list once, lazily, when this form mounts. Never
  // re-fetched per keystroke - all filtering below is client-side.
  useEffect(() => {
    let cancelled = false
    getAirlinesReference().then((rows) => {
      if (!cancelled) setAirlines(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const flightIata = airline?.iataCode && flightNumber ? `${airline.iataCode}${flightNumber}` : null

  const matches = useMemo(() => {
    if (!airlines || !query) return []
    const q = query.toLowerCase()

    // AirLabs' airline database has ~6,500 entries, most of them small,
    // historic, or military operators with no IATA code at all. Unranked
    // substring matching lets one of those (e.g. "AFTN Communications
    // Centre" containing "cat") outrank the real commercial carrier the TM
    // is searching for, just because it sorts earlier alphabetically. Rank
    // by match quality first, alphabetically within a tier, and only fall
    // through to a bare substring match if nothing better exists.
    type Ranked = { airline: Airline; tier: number }
    const ranked: Ranked[] = []

    for (const a of airlines) {
      const name = a.name.toLowerCase()
      const iata = a.iataCode?.toLowerCase() ?? ''
      const icao = a.icaoCode?.toLowerCase() ?? ''

      let tier: number | null = null
      if (iata === q) tier = 0
      else if (name.startsWith(q)) tier = 1
      else if (iata.startsWith(q)) tier = 2
      else if (icao.startsWith(q)) tier = 3
      else if (a.iataCode && name.includes(q)) tier = 4
      else if (name.includes(q) || icao.includes(q)) tier = 5

      if (tier !== null) ranked.push({ airline: a, tier })
    }

    ranked.sort((x, y) => x.tier - y.tier || x.airline.name.localeCompare(y.airline.name))
    return ranked.slice(0, 8).map((r) => r.airline)
  }, [airlines, query])

  const detected = useMemo(() => detectFlightCode(query), [query])
  const detectedAirline = useMemo(() => {
    if (!detected || !airlines) return null
    return airlines.find((a) => a.iataCode?.toUpperCase() === detected.code) ?? null
  }, [detected, airlines])

  function selectAirline(a: Airline, numberFromQuery?: string) {
    setAirline(a)
    if (numberFromQuery) setFlightNumber(numberFromQuery)
    setStep('date')
  }

  function handleDateInputChange(v: string) {
    setDateInput(v)
    setParsedDate(parseFlightDate(v))
  }

  function commitDate(d: ParsedFlightDate) {
    setParsedDate(d)
    setDateInput(d.label)
    setCalendarOpen(false)
  }

  // Once airline + number + date are all set, look up the flight.
  useEffect(() => {
    if (!flightIata || !parsedDate) return
    setLookupLoading(true)
    setError(null)
    lookupFlightForAdd(flightIata).then((result) => {
      setLookupLoading(false)
      if (result.error || !result.lookup) {
        setError(result.error ?? 'Flight lookup failed.')
        setLookup(null)
        return
      }
      setLookup(result.lookup)
      // Only trust the lookup's live/status fields if it actually describes
      // the same calendar date the TM picked. AirLabs returns the *current*
      // instance of a flight number, which for a future date is almost
      // certainly a different day's flight - see the adapter's file header.
      const lookupDate = result.lookup.dep_time_local?.slice(0, 10) ?? null
      setSameDateAsLookup(lookupDate === parsedDate.date)
      setStep('card')
    })
  }, [flightIata, parsedDate])

  function handleCommit() {
    if (!lookup || !parsedDate) return
    setError(null)

    const departLocal = `${parsedDate.date}T${timeOfDay(lookup.dep_time_local)}`
    // Arrival may land the next day; arr_time_local already carries the
    // correct date for that, so use it directly rather than assuming
    // same-day as departure.
    const arriveDatePart = lookup.arr_time_local?.slice(0, 10) ?? parsedDate.date
    const arriveLocal = `${arriveDatePart}T${timeOfDay(lookup.arr_time_local)}`

    startTransition(async () => {
      const result = await createTransportSegment(tourId, {
        tour_date_id: tourDateId,
        mode: 'flight',
        origin: lookup.origin_name ? `${lookup.origin_name} (${lookup.origin_iata})` : lookup.origin_iata,
        destination: lookup.destination_name
          ? `${lookup.destination_name} (${lookup.destination_iata})`
          : lookup.destination_iata,
        depart_at: fromDatetimeLocal(departLocal, timezone),
        arrive_at: fromDatetimeLocal(arriveLocal, timezone),
        carrier_operator: lookup.airline_name ?? airline?.name ?? null,
        vehicle_or_flight_no: flightIata,
        origin_iata: lookup.origin_iata,
        destination_iata: lookup.destination_iata,
        flight_status: sameDateAsLookup ? lookup.flight_status : 'scheduled',
        gate: sameDateAsLookup ? lookup.dep_gate : null,
        terminal: sameDateAsLookup ? lookup.dep_terminal : null,
        actual_depart_at: sameDateAsLookup ? lookup.actual_depart_at : null,
        actual_arrive_at: sameDateAsLookup ? lookup.actual_arrive_at : null,
        last_tracked_at: sameDateAsLookup ? new Date().toISOString() : null,
      })

      if (result.error || !result.segmentId) {
        setError(result.error ?? 'Failed to add flight.')
        return
      }

      setSegmentId(result.segmentId)
      router.refresh()
      setStep('reference')
    })
  }

  function handleSaveReference() {
    startTransition(async () => {
      if (segmentId && bookingRef) {
        await updateTransportSegment(segmentId, { booking_reference: bookingRef })
        router.refresh()
      }
      onSuccess()
    })
  }

  if (step === 'manual') {
    return (
      <ManualFlightForm
        tourId={tourId}
        tourDateId={tourDateId}
        date={date}
        timezone={timezone}
        onBack={() => setStep('search')}
        onSuccess={onSuccess}
      />
    )
  }

  if (step === 'search') {
    const showList = !detectedAirline && query.length > 0

    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Airline, code, or flight number</Label>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cathay Pacific, HKG, or CX150"
            className="h-7 text-xs"
          />
        </div>

        {detectedAirline && detected && (
          <button
            type="button"
            onClick={() => selectAirline(detectedAirline, detected.number)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-2 text-left hover:bg-muted/60"
          >
            <span className="flex items-center gap-2 text-xs">
              <AirlineLogo iataCode={detectedAirline.iataCode} />
              <span>
                <span className="font-semibold">
                  {detectedAirline.iataCode}
                  {detected.number}
                </span>
                <span className="text-muted-foreground"> · {detectedAirline.name}</span>
              </span>
            </span>
            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">Detected flight number</span>
          </button>
        )}

        {showList && matches.length > 0 && (
          <div className="flex flex-col">
            {matches.map((a) => (
              <button
                key={`${a.iataCode ?? ''}-${a.name}`}
                type="button"
                onClick={() => selectAirline(a)}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60"
              >
                <AirlineLogo iataCode={a.iataCode} />
                <span className="text-xs">
                  {highlightMatch(a.name, query)}
                  {a.iataCode && (
                    <span className="text-muted-foreground"> ({highlightMatch(a.iataCode, query)})</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {showList && airlines && matches.length === 0 && (
          <p className="text-xs text-muted-foreground">No matching airline.</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep('manual')} className="flex-1">
            Find by route
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'date') {
    return (
      <div className="space-y-3">
        <FlightChips
          airline={airline}
          flightNumber={flightNumber}
          onEditAirline={() => setStep('search')}
          onFlightNumberChange={setFlightNumber}
        />

        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input
            autoFocus
            value={dateInput}
            onChange={(e) => handleDateInputChange(e.target.value)}
            placeholder="today, tomorrow, monday, 3 aug"
            className="h-7 text-xs"
          />
          {parsedDate && <p className="text-[11px] text-muted-foreground">Detected date: {parsedDate.label}</p>}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => commitDate(parseFlightDate('today')!)}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => commitDate(parseFlightDate('tomorrow')!)}
          >
            Tomorrow
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs">
                Calendar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <Input
                type="date"
                className="h-7 text-xs"
                onChange={(e) => {
                  if (!e.target.value) return
                  const d = parseFlightDate(e.target.value)
                  if (d) commitDate(d)
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        {lookupLoading && <p className="text-xs text-muted-foreground">Looking up flight...</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="button" variant="ghost" size="sm" onClick={() => setStep('search')} className="w-full">
          Back
        </Button>
      </div>
    )
  }

  if (step === 'card' && lookup && parsedDate) {
    return (
      <div className="space-y-3">
        <FlightChips
          airline={airline}
          flightNumber={flightNumber}
          onEditAirline={() => setStep('search')}
          onFlightNumberChange={setFlightNumber}
        />

        <div className="w-full rounded-md border border-border p-3 text-left">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <AirlineLogo iataCode={airline?.iataCode ?? lookup.airline_iata} size="m" />
              {flightIata}
            </span>
            {sameDateAsLookup ? (
              <span className="text-[11px] font-medium text-green-600">
                {STATUS_LABEL[lookup.flight_status] ?? lookup.flight_status}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{parsedDate.label}</span>
            )}
          </div>
          <p className="mt-1 text-xs">
            {lookup.origin_name ?? lookup.origin_iata} to {lookup.destination_name ?? lookup.destination_iata}
          </p>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>
              {lookup.origin_iata} {timeOfDay(lookup.dep_time_local)}
            </span>
            <span>
              {lookup.destination_iata} {timeOfDay(lookup.arr_time_local)}
            </span>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="button" size="sm" disabled={pending} onClick={handleCommit} className="w-full">
          {pending ? 'Adding...' : 'Add flight'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep('date')} className="w-full">
          Back
        </Button>
      </div>
    )
  }

  if (step === 'reference') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Flight added. Add the booking reference once you&apos;ve booked (optional for now).
        </p>
        <div className="space-y-1">
          <Label className="text-xs">Booking reference</Label>
          <Input
            value={bookingRef}
            onChange={(e) => setBookingRef(e.target.value)}
            placeholder="ABC123"
            className="h-7 text-xs"
          />
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={handleSaveReference} className="w-full">
          {pending ? 'Saving...' : bookingRef ? 'Save and close' : 'Skip'}
        </Button>
      </div>
    )
  }

  return null
}

// Manual fallback: "Find by route" (origin/destination without a flight
// number), or the TM just wants to type everything by hand. Same shape as
// the flat form this file replaced - no AirLabs involved.
function ManualFlightForm({
  tourId,
  tourDateId,
  date,
  timezone,
  onBack,
  onSuccess,
}: {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  onBack: () => void
  onSuccess: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createTransportSegment(tourId, {
        tour_date_id: tourDateId,
        mode: 'flight',
        origin: (fd.get('origin') as string) || null,
        destination: (fd.get('destination') as string) || null,
        depart_at: fromDatetimeLocal((fd.get('depart_at') as string) || null, timezone),
        arrive_at: fromDatetimeLocal((fd.get('arrive_at') as string) || null, timezone),
        carrier_operator: (fd.get('carrier_operator') as string) || null,
        vehicle_or_flight_no: (fd.get('vehicle_or_flight_no') as string) || null,
        booking_reference: (fd.get('booking_reference') as string) || null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
      onSuccess()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Airline</Label>
          <Input name="carrier_operator" placeholder="BA" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Flight number</Label>
          <Input name="vehicle_or_flight_no" placeholder="BA0123" className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input name="origin" placeholder="LHR" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input name="destination" placeholder="CDG" className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Departs</Label>
          <Input name="depart_at" type="datetime-local" defaultValue={`${date}T07:00`} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Arrives</Label>
          <Input name="arrive_at" type="datetime-local" className="h-7 text-xs" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Booking reference</Label>
        <Input name="booking_reference" placeholder="ABC123" className="h-7 text-xs" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? 'Adding...' : 'Add flight'}
        </Button>
      </div>
    </form>
  )
}
