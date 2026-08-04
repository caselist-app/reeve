'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AirlineLogo } from '@/components/schedule/airline-logo'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createTransportSegment, updateTransportSegment } from '@/lib/actions/transport'
import {
  getAirlinesReference,
  getAirportsReference,
  lookupFlightForAdd,
  findFlightsByRoute,
  findRouteTimetable,
} from '@/lib/actions/flight-lookup'
import { parseFlightDate, type ParsedFlightDate } from '@/lib/utils/parse-flight-date'
import { formatFlightNumber } from '@/lib/utils/format-flight-number'
import { rankSearch } from '@/lib/utils/rank-search'
import type { NormalizedFlightLookup, NormalizedRouteTimetableEntry } from '@/lib/logistics/adapters/airlabs'
import { fromDatetimeLocal } from '@/lib/schedule/datetime'
import { ManualFlightForm } from '@/components/schedule/add/manual-flight-form'
import { FlightChips, highlightMatch, type Airline } from '@/components/schedule/add/flight-form-ui'
import { timeOfDay, detectFlightCode, weekdayCodeFor, STATUS_LABEL } from '@/components/schedule/add/flight-form-helpers'

interface AddFlightFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  onBack: () => void
  onSuccess: () => void
}

type Airport = { iataCode: string; icaoCode: string | null; name: string; city: string | null }
type Step = 'search' | 'date' | 'card' | 'reference' | 'route' | 'manual'

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

  // "Find by route": airline + two airports, no flight number known. Each
  // is a selected reference-table row (not a raw string) so the search uses
  // the exact same ranked-autocomplete pattern as the main airline search.
  const [airports, setAirports] = useState<Airport[] | null>(null)
  const [routeAirline, setRouteAirline] = useState<Airline | null>(null)
  const [routeAirlineQuery, setRouteAirlineQuery] = useState('')
  const [routeFrom, setRouteFrom] = useState<Airport | null>(null)
  const [routeFromQuery, setRouteFromQuery] = useState('')
  const [routeTo, setRouteTo] = useState<Airport | null>(null)
  const [routeToQuery, setRouteToQuery] = useState('')
  const [routeResults, setRouteResults] = useState<NormalizedFlightLookup[] | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)

  // "Search timetable": same airline/from/to selection as "Find by route"
  // above (shared state, since a TM only uses one of the two at a time),
  // but for a specific future date instead of AirLabs' live board. Its own
  // date field and results, since the two searches return different shapes.
  const [timetableDateInput, setTimetableDateInput] = useState('')
  const [timetableParsedDate, setTimetableParsedDate] = useState<ParsedFlightDate | null>(null)
  const [timetableResults, setTimetableResults] = useState<NormalizedRouteTimetableEntry[] | null>(null)
  const [timetableError, setTimetableError] = useState<string | null>(null)

  // Load the cached airline and airport lists once, lazily, when this form
  // mounts. Never re-fetched per keystroke - all filtering below is
  // client-side.
  useEffect(() => {
    let cancelled = false
    getAirlinesReference().then((rows) => {
      if (!cancelled) setAirlines(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getAirportsReference().then((rows) => {
      if (!cancelled) setAirports(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const flightIata = airline?.iataCode && flightNumber ? `${airline.iataCode}${flightNumber}` : null

  // AirLabs' airline database has ~6,500 entries, most of them small,
  // historic, or military operators with no IATA code at all. Unranked
  // substring matching lets one of those (e.g. "AFTN Communications
  // Centre" containing "cat") outrank the real commercial carrier the TM is
  // searching for, just because it sorts earlier alphabetically - rankSearch
  // fixes that. Shared with the "Find by route" fields below so every
  // reference-table search in this form behaves identically.
  const matches = useMemo(
    () =>
      airlines && query
        ? rankSearch(airlines, query, (a) => ({ primaryCode: a.iataCode, secondaryCode: a.icaoCode, name: a.name }))
        : [],
    [airlines, query]
  )

  const routeAirlineMatches = useMemo(
    () =>
      airlines
        ? rankSearch(airlines, routeAirlineQuery, (a) => ({ primaryCode: a.iataCode, secondaryCode: a.icaoCode, name: a.name }), 6)
        : [],
    [airlines, routeAirlineQuery]
  )

  const routeFromMatches = useMemo(
    () =>
      airports
        ? rankSearch(airports, routeFromQuery, (a) => ({ primaryCode: a.iataCode, secondaryCode: a.icaoCode, name: a.name, extra: a.city }), 6)
        : [],
    [airports, routeFromQuery]
  )

  const routeToMatches = useMemo(
    () =>
      airports
        ? rankSearch(airports, routeToQuery, (a) => ({ primaryCode: a.iataCode, secondaryCode: a.icaoCode, name: a.name, extra: a.city }), 6)
        : [],
    [airports, routeToQuery]
  )

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

  // Once airline + number + date are all set, look up the flight. Typing a
  // date character-by-character re-parses (and re-fires this effect) on
  // every valid partial input, so more than one lookup call can be in
  // flight at once. Without the cancelled guard, an earlier call that
  // resolves after a later one already succeeded could stomp the error
  // state (or vice versa) - producing a resolved flight card and a stale
  // "No flight found" message side by side. Same cancellation pattern
  // already used by the airline/airport reference-loading effects above.
  useEffect(() => {
    if (!flightIata || !parsedDate) return
    let cancelled = false
    setLookupLoading(true)
    setError(null)
    lookupFlightForAdd(flightIata).then((result) => {
      if (cancelled) return
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
    return () => {
      cancelled = true
    }
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

  function handleRouteSearch() {
    if (!routeAirline?.iataCode || !routeFrom || !routeTo) return
    setRouteError(null)
    setRouteResults(null)
    startTransition(async () => {
      const result = await findFlightsByRoute(routeAirline.iataCode!, routeFrom.iataCode, routeTo.iataCode)
      if (result.error) {
        setRouteError(result.error)
        return
      }
      setRouteResults(result.results)
    })
  }

  // A route-search result already carries live/near-term data straight from
  // AirLabs' current board - no second lookup call needed, and it always
  // describes itself (never a different day's occurrence, unlike the
  // flight-number search path - see the adapter's file header).
  function selectRouteResult(result: NormalizedFlightLookup) {
    const resultDate = result.dep_time_local?.slice(0, 10)
    const parsed = resultDate ? parseFlightDate(resultDate) : null
    setAirline({ iataCode: result.airline_iata, icaoCode: null, name: result.airline_name ?? routeAirline?.name ?? '' })
    setFlightNumber(result.flight_iata.replace(/^[A-Za-z]+/, ''))
    setLookup(result)
    setSameDateAsLookup(true)
    setParsedDate(parsed ?? { date: resultDate ?? '', label: resultDate ?? '' })
    setStep('card')
  }

  function handleTimetableDateInputChange(v: string) {
    setTimetableDateInput(v)
    setTimetableParsedDate(parseFlightDate(v))
  }

  function handleTimetableSearch() {
    if (!routeAirline?.iataCode || !routeFrom || !routeTo || !timetableParsedDate) return
    setTimetableError(null)
    setTimetableResults(null)
    startTransition(async () => {
      const result = await findRouteTimetable(routeAirline.iataCode!, routeFrom.iataCode, routeTo.iataCode)
      if (result.error) {
        setTimetableError(result.error)
        return
      }
      setTimetableResults(result.results)
    })
  }

  // Timetable entries are a static schedule, not a live lookup - AirLabs'
  // own docs describe the Routes DB as "not real-time". Unlike
  // selectRouteResult (which already carries live data), this constructs a
  // synthetic lookup by hand: no gate, no terminal, no live status, and
  // sameDateAsLookup is always false so the card renders exactly the way
  // any other far-out-date flight already does (grey, not live) - the
  // tracking job is what upgrades it to real data once in-window.
  function selectTimetableResult(entry: NormalizedRouteTimetableEntry) {
    if (!timetableParsedDate) return
    const airlineCode = entry.flightIata.match(/^[A-Za-z]+/)?.[0] ?? routeAirline?.iataCode ?? null

    setAirline({ iataCode: airlineCode, icaoCode: routeAirline?.icaoCode ?? null, name: routeAirline?.name ?? '' })
    setFlightNumber(entry.flightNumber ?? entry.flightIata.replace(/^[A-Za-z]+/, ''))
    setLookup({
      airline_name: routeAirline?.name ?? null,
      airline_iata: airlineCode,
      flight_iata: entry.flightIata,
      origin_iata: entry.depIata ?? routeFrom?.iataCode ?? null,
      destination_iata: entry.arrIata ?? routeTo?.iataCode ?? null,
      origin_name: routeFrom?.name ?? entry.depIata,
      destination_name: routeTo?.name ?? entry.arrIata,
      dep_terminal: null,
      dep_gate: null,
      arr_terminal: null,
      arr_gate: null,
      // The Routes DB only gives a bare time-of-day per airport, no date -
      // both ends get pinned to the TM's chosen date. A long overnight
      // flight landing the next local day will show the wrong date; this
      // is a known simplification of what's already approximate timetable
      // data, not a live lookup.
      dep_time_local: `${timetableParsedDate.date} ${entry.depTimeLocal ?? '00:00'}`,
      arr_time_local: `${timetableParsedDate.date} ${entry.arrTimeLocal ?? '00:00'}`,
      dep_time_utc: null,
      arr_time_utc: null,
      flight_status: 'scheduled',
      actual_depart_at: null,
      actual_arrive_at: null,
      raw: entry,
    })
    setSameDateAsLookup(false)
    setParsedDate(timetableParsedDate)
    setStep('card')
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
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep('route')} className="flex-1">
            Find by route
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'route') {
    const canSearch = !!routeAirline?.iataCode && !!routeFrom && !!routeTo

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Know the airline and airports but not the flight number? Only finds flights departing soon,
          not ones booked weeks out.
        </p>

        <div className="space-y-1">
          <Label className="text-xs">Airline</Label>
          {routeAirline ? (
            <button
              type="button"
              onClick={() => setRouteAirline(null)}
              className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted/60"
            >
              <AirlineLogo iataCode={routeAirline.iataCode} />
              <span className="text-xs">
                <span className="font-semibold">{routeAirline.iataCode}</span>
                <span className="text-muted-foreground"> · {routeAirline.name}</span>
              </span>
            </button>
          ) : (
            <>
              <Input
                value={routeAirlineQuery}
                onChange={(e) => setRouteAirlineQuery(e.target.value)}
                placeholder="Cathay Pacific or CX"
                className="h-7 w-full text-xs"
              />
              {routeAirlineQuery && routeAirlineMatches.length > 0 && (
                <div className="flex flex-col">
                  {routeAirlineMatches.map((a) => (
                    <button
                      key={`${a.iataCode ?? ''}-${a.name}`}
                      type="button"
                      onClick={() => {
                        setRouteAirline(a)
                        setRouteAirlineQuery('')
                      }}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                    >
                      <AirlineLogo iataCode={a.iataCode} />
                      <span className="text-xs">
                        {highlightMatch(a.name, routeAirlineQuery)}
                        {a.iataCode && (
                          <span className="text-muted-foreground"> ({highlightMatch(a.iataCode, routeAirlineQuery)})</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {routeAirlineQuery && airlines && routeAirlineMatches.length === 0 && (
                <p className="text-xs text-muted-foreground">No matching airline.</p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            {routeFrom ? (
              <button
                type="button"
                onClick={() => setRouteFrom(null)}
                className="flex w-full items-center rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted/60"
              >
                <span className="text-xs">
                  <span className="font-semibold">{routeFrom.iataCode}</span>
                  <span className="text-muted-foreground"> · {routeFrom.city ?? routeFrom.name}</span>
                </span>
              </button>
            ) : (
              <>
                <Input
                  value={routeFromQuery}
                  onChange={(e) => setRouteFromQuery(e.target.value)}
                  placeholder="London or LHR"
                  className="h-7 text-xs"
                />
                {routeFromQuery && routeFromMatches.length > 0 && (
                  <div className="flex flex-col">
                    {routeFromMatches.map((a) => (
                      <button
                        key={`${a.iataCode}-${a.name}`}
                        type="button"
                        onClick={() => {
                          setRouteFrom(a)
                          setRouteFromQuery('')
                        }}
                        className="flex flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                      >
                        <span className="text-xs">
                          {highlightMatch(a.city ?? a.name, routeFromQuery)}
                          <span className="text-muted-foreground"> ({highlightMatch(a.iataCode, routeFromQuery)})</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {routeFromQuery && airports && routeFromMatches.length === 0 && (
                  <p className="text-xs text-muted-foreground">No matching airport.</p>
                )}
              </>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            {routeTo ? (
              <button
                type="button"
                onClick={() => setRouteTo(null)}
                className="flex w-full items-center rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted/60"
              >
                <span className="text-xs">
                  <span className="font-semibold">{routeTo.iataCode}</span>
                  <span className="text-muted-foreground"> · {routeTo.city ?? routeTo.name}</span>
                </span>
              </button>
            ) : (
              <>
                <Input
                  value={routeToQuery}
                  onChange={(e) => setRouteToQuery(e.target.value)}
                  placeholder="Las Vegas or LAS"
                  className="h-7 text-xs"
                />
                {routeToQuery && routeToMatches.length > 0 && (
                  <div className="flex flex-col">
                    {routeToMatches.map((a) => (
                      <button
                        key={`${a.iataCode}-${a.name}`}
                        type="button"
                        onClick={() => {
                          setRouteTo(a)
                          setRouteToQuery('')
                        }}
                        className="flex flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                      >
                        <span className="text-xs">
                          {highlightMatch(a.city ?? a.name, routeToQuery)}
                          <span className="text-muted-foreground"> ({highlightMatch(a.iataCode, routeToQuery)})</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {routeToQuery && airports && routeToMatches.length === 0 && (
                  <p className="text-xs text-muted-foreground">No matching airport.</p>
                )}
              </>
            )}
          </div>
        </div>

        <Button type="button" size="sm" disabled={!canSearch || pending} onClick={handleRouteSearch} className="w-full">
          {pending ? 'Finding...' : 'Find flight'}
        </Button>

        {routeError && <p className="text-xs text-destructive">{routeError}</p>}

        {routeResults && routeResults.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No flights found departing soon on this route.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep('manual')} className="w-full">
              Enter manually instead
            </Button>
          </div>
        )}

        {routeResults && routeResults.length > 0 && (
          <div className="flex flex-col">
            {routeResults.map((r) => (
              <button
                key={r.flight_iata}
                type="button"
                onClick={() => selectRouteResult(r)}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-2 text-left hover:bg-muted/60"
              >
                <AirlineLogo iataCode={r.airline_iata} />
                <span className="flex-1 text-xs">
                  <span className="font-semibold">{formatFlightNumber(r.flight_iata)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {r.origin_iata} {timeOfDay(r.dep_time_local)} → {r.destination_iata} {timeOfDay(r.arr_time_local)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Know the date but not the flight number? Search the regular timetable instead - not live, so
            no gate or delay info until closer to the day.
          </p>

          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input
              value={timetableDateInput}
              onChange={(e) => handleTimetableDateInputChange(e.target.value)}
              placeholder="3 aug, monday, 2026-08-31"
              className="h-7 text-xs"
            />
            {timetableParsedDate && (
              <p className="text-[11px] text-muted-foreground">Detected date: {timetableParsedDate.label}</p>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canSearch || !timetableParsedDate || pending}
            onClick={handleTimetableSearch}
            className="w-full"
          >
            {pending ? 'Searching...' : 'Search timetable'}
          </Button>

          {timetableError && <p className="text-xs text-destructive">{timetableError}</p>}

          {timetableResults && timetableResults.length === 0 && (
            <p className="text-xs text-muted-foreground">No scheduled flights found for this route.</p>
          )}

          {timetableResults && timetableResults.length > 0 && timetableParsedDate && (() => {
            const weekday = weekdayCodeFor(timetableParsedDate.date)
            const sorted = [...timetableResults].sort((a, b) => {
              const aMatch = a.days.includes(weekday) ? 0 : 1
              const bMatch = b.days.includes(weekday) ? 0 : 1
              return aMatch - bMatch
            })

            return (
              <div className="flex flex-col">
                {sorted.map((r) => {
                  const matchesDay = r.days.includes(weekday)
                  return (
                    <button
                      key={r.flightIata}
                      type="button"
                      onClick={() => selectTimetableResult(r)}
                      className="flex items-center gap-2 rounded-md border border-border px-2 py-2 text-left hover:bg-muted/60"
                    >
                      <AirlineLogo iataCode={r.flightIata.match(/^[A-Za-z]+/)?.[0] ?? null} />
                      <span className="flex-1 text-xs">
                        <span className="font-semibold">{formatFlightNumber(r.flightIata)}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {r.depIata} {r.depTimeLocal ?? '--:--'} → {r.arrIata} {r.arrTimeLocal ?? '--:--'}
                        </span>
                        {r.days.length > 0 && (
                          <span
                            className={
                              matchesDay
                                ? 'ml-1 text-[10px] font-medium text-green-600'
                                : 'ml-1 text-[10px] text-muted-foreground'
                            }
                          >
                            {matchesDay ? `Flies ${weekday}` : r.days.join('/')}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={() => setStep('search')} className="w-full">
          Back
        </Button>
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
