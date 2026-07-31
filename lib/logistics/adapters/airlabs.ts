// AirLabs adapter: single-flight lookup and airline reference data.
// Normalised shapes only leave this file; the raw AirLabs payload is exposed
// solely via `raw` for debugging, same convention as duffel.ts.
//
// Verified live against the real API on 2026-07-31 (flight_iata=CX150):
// - /flight?flight_iata=X returns exactly ONE result: the current/nearest
//   instance of that flight number (today's, whether upcoming or already
//   landed). It takes no date parameter.
// - /schedules?flight_iata=X behaves identically for a single flight number
//   (total_items: 1, has_more: false) - it is not a multi-day schedule
//   search. Because /flight already returns everything /schedules would for
//   a single flight number (route, terminals, gates, live status, delay
//   minutes), this adapter only calls /flight. There is no AirLabs call that
//   answers "show me flight X on each of the next N days."
//
// Practical consequence for callers (Add Flight flow, live tracking job):
// a lookup always describes the CURRENT real-world instance of the flight
// number, not necessarily the date the TM picked. At add-time, callers
// borrow only the time-of-day (dep_time/arr_time, airport-local) and combine
// it with the TM's chosen date to build a scheduled estimate. The live
// tracking job re-queries once the segment's stored depart_at falls inside
// the polling window (see trigger/jobs/flight-status-check.ts), at which
// point the "current instance" genuinely is the TM's flight and the
// response reflects real live data.

const AIRLABS_BASE = 'https://airlabs.co/api/v9'

// Raw AirLabs status values, confirmed from live responses and the /flight,
// /schedules, /flights docs pages. Distinct from Reeve's own flight_status
// column vocabulary (scheduled/delayed/cancelled/departed/landed) - never
// pass one through as the other without normalizeStatus().
type AirLabsRawStatus = 'scheduled' | 'active' | 'en-route' | 'landed' | 'cancelled'

// AirLabs never returns a "delayed" status value; delay is reported
// separately as minutes late. A flight is normalised to 'delayed' when still
// scheduled/active but running at least this many minutes late.
const DELAY_THRESHOLD_MIN = 15

// Rate-limit errors are distinguished from other failures so callers (the
// live tracking job in particular) can back off rather than treating a
// month_limit_exceeded the same as a malformed request.
export class AirLabsRateLimitError extends Error {}

interface AirLabsFlightResponse {
  airline_iata: string | null
  airline_icao: string | null
  airline_name: string | null
  flight_iata: string | null
  flight_icao: string | null
  flight_number: string | null
  dep_iata: string | null
  dep_icao: string | null
  dep_name: string | null
  dep_city: string | null
  dep_terminal: string | null
  dep_gate: string | null
  dep_time: string | null        // airport-local "YYYY-MM-DD HH:MM"
  dep_time_utc: string | null    // "YYYY-MM-DD HH:MM", no seconds/offset
  dep_estimated_utc: string | null
  dep_actual_utc: string | null
  arr_iata: string | null
  arr_icao: string | null
  arr_name: string | null
  arr_city: string | null
  arr_terminal: string | null
  arr_gate: string | null
  arr_time: string | null
  arr_time_utc: string | null
  arr_estimated_utc: string | null
  arr_actual_utc: string | null
  status: AirLabsRawStatus | null
  dep_delayed: number | null
  arr_delayed: number | null
}

interface AirLabsAirlineResponse {
  name: string
  iata_code: string | null
  icao_code: string | null
}

interface AirLabsAirportResponse {
  name: string
  iata_code: string | null
  icao_code: string | null
  city: string | null
  country_code: string | null
}

interface AirLabsErrorEnvelope {
  error: { message: string; code: string }
}

interface AirLabsSuccessEnvelope<T> {
  request: { has_more?: boolean }
  response: T
}

type AirLabsEnvelope<T> = AirLabsSuccessEnvelope<T> | AirLabsErrorEnvelope

function isErrorEnvelope<T>(json: AirLabsEnvelope<T>): json is AirLabsErrorEnvelope {
  return 'error' in json
}

// Low-level call: hits one AirLabs method, returns the full envelope so
// callers needing pagination (fetchAllAirlines) can read `has_more`.
// Throws on rate-limit and unexpected errors; returns null only for
// not_found, which is a legitimate "no such flight" result, not a failure.
async function callAirLabs<T>(
  method: string,
  params: Record<string, string>
): Promise<AirLabsSuccessEnvelope<T> | null> {
  const apiKey = process.env.AIRLABS_API_KEY
  if (!apiKey) {
    throw new Error('AIRLABS_API_KEY not configured')
  }

  const query = new URLSearchParams({ ...params, api_key: apiKey })
  const res = await fetch(`${AIRLABS_BASE}/${method}?${query.toString()}`)
  const json = (await res.json()) as AirLabsEnvelope<T>

  if (isErrorEnvelope(json)) {
    const { code, message } = json.error

    if (code === 'not_found') return null

    if (code === 'minute_limit_exceeded' || code === 'hour_limit_exceeded' || code === 'month_limit_exceeded') {
      throw new AirLabsRateLimitError(`AirLabs rate limit (${method}): ${code}`)
    }

    throw new Error(`AirLabs API error (${method}): ${code} - ${message}`)
  }

  return json
}

// AirLabs *_time_utc fields are "YYYY-MM-DD HH:MM" with no seconds or zone.
// Appends seconds and Z to make a real ISO 8601 UTC string.
function toIsoUtc(airlabsUtc: string | null): string | null {
  if (!airlabsUtc) return null
  return `${airlabsUtc.replace(' ', 'T')}:00Z`
}

// Reeve's own normalised vocabulary. Deliberately not a passthrough of
// AirLabs' `status` field - see DELAY_THRESHOLD_MIN comment above.
export type FlightStatus = 'scheduled' | 'delayed' | 'cancelled' | 'departed' | 'landed'

function normalizeStatus(raw: AirLabsFlightResponse): FlightStatus {
  if (raw.status === 'cancelled') return 'cancelled'
  if (raw.status === 'landed') return 'landed'
  if (raw.status === 'active' || raw.status === 'en-route') return 'departed'

  // status is 'scheduled' or unrecognised: fall back to delay minutes.
  const delayMin = Math.max(raw.dep_delayed ?? 0, raw.arr_delayed ?? 0)
  return delayMin >= DELAY_THRESHOLD_MIN ? 'delayed' : 'scheduled'
}

export interface NormalizedFlightLookup {
  airline_name: string | null
  airline_iata: string | null
  flight_iata: string
  origin_iata: string | null
  destination_iata: string | null
  origin_name: string | null
  destination_name: string | null
  dep_terminal: string | null
  dep_gate: string | null
  arr_terminal: string | null
  arr_gate: string | null
  // Airport-local "YYYY-MM-DD HH:MM". Add-time callers use only the HH:MM
  // portion (see file header); the live tracking job uses the UTC fields.
  dep_time_local: string | null
  arr_time_local: string | null
  dep_time_utc: string | null   // ISO 8601 UTC
  arr_time_utc: string | null   // ISO 8601 UTC
  flight_status: FlightStatus
  actual_depart_at: string | null // ISO 8601 UTC, set once departed/landed
  actual_arrive_at: string | null // ISO 8601 UTC, set once landed
  raw: unknown
}

function normalizeFlight(raw: AirLabsFlightResponse): NormalizedFlightLookup {
  const status = normalizeStatus(raw)

  return {
    airline_name: raw.airline_name,
    airline_iata: raw.airline_iata,
    flight_iata: raw.flight_iata ?? '',
    origin_iata: raw.dep_iata,
    destination_iata: raw.arr_iata,
    origin_name: raw.dep_name,
    destination_name: raw.arr_name,
    dep_terminal: raw.dep_terminal,
    dep_gate: raw.dep_gate,
    arr_terminal: raw.arr_terminal,
    arr_gate: raw.arr_gate,
    dep_time_local: raw.dep_time,
    arr_time_local: raw.arr_time,
    dep_time_utc: toIsoUtc(raw.dep_time_utc),
    arr_time_utc: toIsoUtc(raw.arr_time_utc),
    flight_status: status,
    actual_depart_at: status === 'departed' || status === 'landed' ? toIsoUtc(raw.dep_actual_utc) : null,
    actual_arrive_at: status === 'landed' ? toIsoUtc(raw.arr_actual_utc) : null,
    raw,
  }
}

// Looks up a flight number's current/nearest instance. Used both by the Add
// Flight flow (to fetch a schedule template) and the live tracking job (to
// poll real status once in-window). Returns null on AirLabs not_found (no
// such flight number, or nothing in range) - never throws for that case.
export async function lookupFlightByNumber(flightIata: string): Promise<NormalizedFlightLookup | null> {
  const envelope = await callAirLabs<AirLabsFlightResponse>('flight', { flight_iata: flightIata })
  if (!envelope) return null
  return normalizeFlight(envelope.response)
}

// Route search for the TM who knows the airline and the two airports but not
// the flight number ("Find by route"). Unlike lookupFlightByNumber, /schedules
// accepts dep_iata + arr_iata + airline_iata together and returns every
// matching departure on the current near-term board (verified live: BNE-HKG
// on Cathay Pacific returned two distinct flight numbers). Same "up to ~10
// hours ahead" ceiling as the rest of the schedules endpoint applies here -
// this only surfaces flights happening soon, not ones booked weeks out.
export async function searchFlightsByRoute(params: {
  airlineIata: string
  depIata: string
  arrIata: string
}): Promise<NormalizedFlightLookup[]> {
  const envelope = await callAirLabs<AirLabsFlightResponse[]>('schedules', {
    airline_iata: params.airlineIata,
    dep_iata: params.depIata,
    arr_iata: params.arrIata,
  })
  if (!envelope) return []
  return envelope.response.map(normalizeFlight)
}

interface AirLabsRouteResponse {
  airline_iata: string | null
  flight_iata: string | null
  flight_number: string | null
  dep_iata: string | null
  dep_time: string | null // "HH:MM", departure airport's own local time
  arr_iata: string | null
  arr_time: string | null // "HH:MM", arrival airport's own local time
  duration: number | null // minutes
  days: string[] | null // lowercase 3-letter day codes: sun, mon, tue, ...
}

export interface NormalizedRouteTimetableEntry {
  flightIata: string
  flightNumber: string | null
  depIata: string | null
  depTimeLocal: string | null
  arrIata: string | null
  arrTimeLocal: string | null
  durationMinutes: number | null
  days: string[]
}

// The Routes DB ("/routes"), not the same endpoint as searchFlightsByRoute's
// "/schedules". This one is explicitly NOT real-time: AirLabs' own docs
// describe it as a static, regularly-updated timetable ("use data from
// Airline Routes Database to predict flight schedules for the distant
// future"), which is exactly what a TM needs when they know the airline,
// route, and a future date but not the flight number - "Find by route"
// above only works within ~10 hours of departure because it queries the
// live board, not a timetable. Each entry's `days` tells you which days of
// the week that flight number typically operates, letting a caller match
// it against a specific future date's weekday. No live status, no gates:
// this is a schedule template, same category of data as
// lookupFlightByNumber's borrowed time-of-day, not a live lookup.
export async function searchRouteTimetable(params: {
  airlineIata: string
  depIata: string
  arrIata: string
}): Promise<NormalizedRouteTimetableEntry[]> {
  const envelope = await callAirLabs<AirLabsRouteResponse[]>('routes', {
    airline_iata: params.airlineIata,
    dep_iata: params.depIata,
    arr_iata: params.arrIata,
  })
  if (!envelope) return []

  return envelope.response
    .filter((r): r is AirLabsRouteResponse & { flight_iata: string } => !!r.flight_iata)
    .map((r) => ({
      flightIata: r.flight_iata,
      flightNumber: r.flight_number,
      depIata: r.dep_iata,
      depTimeLocal: r.dep_time,
      arrIata: r.arr_iata,
      arrTimeLocal: r.arr_time,
      durationMinutes: r.duration,
      days: (r.days ?? []).map((d) => d.toLowerCase()),
    }))
}

export interface NormalizedAirline {
  iataCode: string | null
  icaoCode: string | null
  name: string
}

// Fetches the full AirLabs airline database (no filter param = all
// airlines). The /airlines endpoint documents no limit/offset parameters,
// unlike /schedules, so it is not confirmed to paginate - but the loop
// defensively follows `request.has_more` in case it does, using the same
// meta shape /schedules exposes. In the common case this is a single call.
export async function fetchAllAirlines(): Promise<NormalizedAirline[]> {
  const airlines: NormalizedAirline[] = []
  let offset = 0

  for (;;) {
    const params: Record<string, string> = {}
    if (offset > 0) params.offset = String(offset)
    const envelope = await callAirLabs<AirLabsAirlineResponse[]>('airlines', params)
    if (!envelope) break

    for (const a of envelope.response) {
      airlines.push({ iataCode: a.iata_code, icaoCode: a.icao_code, name: a.name })
    }

    if (!envelope.request.has_more) break
    offset += envelope.response.length
  }

  return airlines
}

export interface NormalizedAirport {
  iataCode: string | null
  icaoCode: string | null
  name: string
  city: string | null
  countryCode: string | null
}

// Fetches the full AirLabs airport database (no filter param = all
// airports), same defensive has_more pagination loop as fetchAllAirlines -
// the /airports endpoint documents no limit/offset params either, so this
// is not confirmed to paginate but follows the same meta shape if it does.
export async function fetchAllAirports(): Promise<NormalizedAirport[]> {
  const airports: NormalizedAirport[] = []
  let offset = 0

  for (;;) {
    const params: Record<string, string> = {}
    if (offset > 0) params.offset = String(offset)
    const envelope = await callAirLabs<AirLabsAirportResponse[]>('airports', params)
    if (!envelope) break

    for (const a of envelope.response) {
      airports.push({
        iataCode: a.iata_code,
        icaoCode: a.icao_code,
        name: a.name,
        city: a.city,
        countryCode: a.country_code,
      })
    }

    if (!envelope.request.has_more) break
    offset += envelope.response.length
  }

  return airports
}
