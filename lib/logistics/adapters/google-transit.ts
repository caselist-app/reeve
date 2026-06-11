// Google Directions API adapter — transit mode.
// Two entrypoints:
//   searchGoogleTransit    — ground leg from hub to venue (returns GroundTransit)
//   searchGoogleTransitCityToCity — freeform city-to-city (returns TravelOption[])
// Requires GOOGLE_MAPS_API_KEY.

import type { GroundTransit, TransitStep, TravelOption } from '@/lib/logistics/types'

export type GoogleTransitParams = {
  origin_lat: number
  origin_lng: number
  origin_name?: string | null  // airport or station name — used as text origin when set
  dest_address: string         // venue address — fallback destination
  dest_lat?: number | null     // venue geocoded lat — preferred destination
  dest_lng?: number | null     // venue geocoded lng — preferred destination
  depart_after: string         // ISO — earliest the person can leave the hub
}

// ── Google Directions API response types (only fields we read) ──

interface GDStop { name: string }
interface GDTime { value: number; text: string }  // value = Unix seconds

interface GDTransitDetails {
  departure_stop: GDStop
  arrival_stop: GDStop
  departure_time: GDTime
  arrival_time: GDTime
  num_stops: number
  line: {
    name: string
    short_name?: string
    vehicle: { type: string }
  }
}

interface GDStep {
  travel_mode: 'WALKING' | 'TRANSIT' | 'DRIVING'
  duration: { value: number }   // seconds
  html_instructions: string
  transit_details?: GDTransitDetails
}

interface GDLeg {
  departure_time: GDTime
  arrival_time: GDTime
  duration: { value: number }
  steps: GDStep[]
}

interface GDResponse {
  status: string
  routes: { legs: GDLeg[] }[]
  error_message?: string
}

// Strip HTML tags from Google's instruction strings.
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}


function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString()
}

// Parse a leg's steps into TransitStep[]. Walking steps use html_instructions
// for names. Waiting time between a walk and the next transit departure is
// surfaced explicitly so the TM sees it.
function parseSteps(steps: GDStep[]): TransitStep[] {
  const result: TransitStep[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const durationMin = Math.round(step.duration.value / 60)

    if (step.travel_mode === 'TRANSIT' && step.transit_details) {
      const td = step.transit_details

      result.push({
        mode: 'transit',
        from_name: td.departure_stop.name,
        to_name: td.arrival_stop.name,
        depart_at: toIso(td.departure_time.value),
        arrive_at: toIso(td.arrival_time.value),
        duration_min: Math.round((td.arrival_time.value - td.departure_time.value) / 60),
        line_name: td.line.name || td.line.short_name || null,
        vehicle_type: td.line.vehicle?.type ?? null,
        num_stops: td.num_stops,
      })
    } else if (step.travel_mode === 'WALKING') {
      // Name the walking step from surrounding context.
      const nextTransit = steps.slice(i + 1).find(s => s.travel_mode === 'TRANSIT')
      const prevTransit = steps.slice(0, i).reverse().find(s => s.travel_mode === 'TRANSIT')

      const toName = nextTransit?.transit_details?.departure_stop.name
        ?? stripHtml(step.html_instructions)
      const fromName = prevTransit?.transit_details?.arrival_stop.name
        ?? 'Hub'

      if (durationMin > 0) {
        result.push({
          mode: 'walking',
          from_name: fromName,
          to_name: toName,
          depart_at: null,
          arrive_at: null,
          duration_min: durationMin,
          line_name: null,
          vehicle_type: null,
          num_stops: null,
        })
      }

      // Check for a wait between this walk arriving and the next transit departing.
      // Google doesn't always surface waiting as an explicit step.
      const nextStep = steps[i + 1]
      if (nextStep?.travel_mode === 'TRANSIT' && nextStep.transit_details) {
        // We'd need to know when the walking step ends to compute wait.
        // Google doesn't give absolute times on walking steps — only the transit
        // departure is anchored. We derive wait = transit.depart - (leg.depart + cumulative walking).
        // As a pragmatic V1 approach: if the transit step is the next step and has
        // a departure time, the wait is implicit in the total duration. We don't
        // separately show it here because we can't compute it without cumulative time.
        // The total journey duration from the API already includes it.
      }
    }
  }

  return result
}

// Build waiting steps by comparing walking arrival to transit departure.
// Requires knowing when each step ends, so we do a two-pass approach.
function insertWaits(steps: GDStep[], legDepartUnix: number): TransitStep[] {
  // Build a timeline: for each step, compute start and end times.
  let cursor = legDepartUnix // Unix seconds

  const timed: { step: GDStep; startUnix: number; endUnix: number }[] = []
  for (const step of steps) {
    const startUnix = cursor
    let endUnix: number

    if (step.travel_mode === 'TRANSIT' && step.transit_details) {
      // Transit steps are anchored to schedule — the actual depart time.
      // The cursor may be behind the transit departure (that's the wait).
      const transitDepart = step.transit_details.departure_time.value
      endUnix = step.transit_details.arrival_time.value
      // Record any wait between cursor and transit departure.
      timed.push({ step: { travel_mode: 'WALKING', duration: { value: 0 }, html_instructions: '' } as GDStep, startUnix: cursor, endUnix: transitDepart })
      timed.push({ step, startUnix: transitDepart, endUnix })
      cursor = endUnix
    } else {
      endUnix = cursor + step.duration.value
      timed.push({ step, startUnix, endUnix })
      cursor = endUnix
    }
  }

  const result: TransitStep[] = []
  let prevTransitArrival: string | null = null

  for (const { step, startUnix, endUnix } of timed) {
    const durationMin = Math.round((endUnix - startUnix) / 60)
    if (durationMin <= 0) continue

    if (step.travel_mode === 'TRANSIT' && step.transit_details) {
      const td = step.transit_details
      prevTransitArrival = toIso(td.arrival_time.value)
      result.push({
        mode: 'transit',
        from_name: td.departure_stop.name,
        to_name: td.arrival_stop.name,
        depart_at: toIso(td.departure_time.value),
        arrive_at: toIso(td.arrival_time.value),
        duration_min: Math.round((td.arrival_time.value - td.departure_time.value) / 60),
        line_name: td.line.name || td.line.short_name || null,
        vehicle_type: td.line.vehicle?.type ?? null,
        num_stops: td.num_stops,
      })
    } else if (step.travel_mode === 'WALKING') {
      // Find neighbouring transit steps to name this walk.
      const idx = timed.indexOf(timed.find(t => t.step === step)!)
      const nextTransit = timed.slice(idx + 1).find(t => t.step.travel_mode === 'TRANSIT')
      const prevTransit = timed.slice(0, idx).reverse().find(t => t.step.travel_mode === 'TRANSIT')

      const fromName = prevTransit?.step.transit_details?.arrival_stop.name ?? 'Hub'
      // Strip Google's "Walk to " / "Head toward " prefix from html_instructions
      // so we don't render "Walk to Walk to ..." in the UI.
      const rawInstruction = stripHtml(step.html_instructions)
        .replace(/^(walk to|head toward|walk toward)\s+/i, '')
      const toName = nextTransit?.step.transit_details?.departure_stop.name ?? rawInstruction

      result.push({
        mode: 'walking',
        from_name: fromName,
        to_name: toName,
        depart_at: null,
        arrive_at: null,
        duration_min: durationMin,
        line_name: null,
        vehicle_type: null,
        num_stops: null,
      })
    } else {
      // Implicit wait step (cursor gap before transit departure).
      const prevStep = result[result.length - 1]
      const stopName = prevStep?.to_name ?? 'Stop'
      result.push({
        mode: 'waiting',
        from_name: stopName,
        to_name: stopName,
        depart_at: null,
        arrive_at: toIso(endUnix),
        duration_min: durationMin,
        line_name: null,
        vehicle_type: null,
        num_stops: null,
      })
    }
  }

  void prevTransitArrival  // used indirectly through timed above

  // Merge consecutive walking steps that share the same destination.
  // Google often splits a single walk into sub-legs (e.g. "exit terminal" +
  // "walk to platform") with the same to_name — combine them into one step.
  const merged: TransitStep[] = []
  for (const step of result) {
    const prev = merged[merged.length - 1]
    if (
      step.mode === 'walking' &&
      prev?.mode === 'walking' &&
      prev.to_name === step.to_name
    ) {
      prev.duration_min += step.duration_min
    } else {
      merged.push({ ...step })
    }
  }

  return merged
}

// ── City-to-city transit search ───────────────────────────────────────────────
// Used by the freeform travel planner to find intercity rail and coach options
// (e.g. AVE Madrid→Zamora, Eurostar London→Paris) without a show context.
// Returns one TravelOption per route alternative Google finds.

export type GoogleTransitCityParams = {
  from_lat: number
  from_lng: number
  from_name: string   // city or place name — used as origin text
  to_lat: number
  to_lng: number
  to_name: string
  date: string        // YYYY-MM-DD — we depart at 06:00 local, giving a full day
}

// Determine the dominant vehicle type for a route's legs to pick a mode.
function dominantMode(steps: GDStep[]): TravelOption['mode'] {
  const transitSteps = steps.filter(
    (s) => s.travel_mode === 'TRANSIT' && s.transit_details
  )
  if (transitSteps.length === 0) return 'ground'

  const typeCounts: Record<string, number> = {}
  for (const s of transitSteps) {
    const type = s.transit_details!.line.vehicle.type
    typeCounts[type] = (typeCounts[type] ?? 0) + 1
  }

  const dominant = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  const RAIL_TYPES = new Set([
    'HIGH_SPEED_TRAIN', 'LONG_DISTANCE_TRAIN', 'RAIL',
    'INTERCITY_BUS', // coaches like ALSA are "rail" in TM parlance
  ])
  return RAIL_TYPES.has(dominant) ? 'rail' : 'ground'
}

// Carrier name from the dominant transit step's line.
function routeCarrier(steps: GDStep[]): string {
  const first = steps.find((s) => s.travel_mode === 'TRANSIT' && s.transit_details)
  if (!first?.transit_details) return 'Transit'
  const line = first.transit_details.line
  return line.name || line.short_name || 'Transit'
}

// Leg reference (train/service number) from the first transit step.
function routeLegRef(steps: GDStep[]): string {
  const first = steps.find((s) => s.travel_mode === 'TRANSIT' && s.transit_details)
  if (!first?.transit_details) return ''
  return first.transit_details.line.short_name ?? first.transit_details.line.name ?? ''
}

export async function searchGoogleTransitCityToCity(
  params: GoogleTransitCityParams
): Promise<TravelOption[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return []

  // Depart at 06:00 UTC on the requested date to cover the full day's services.
  const departUnix = Math.floor(new Date(`${params.date}T06:00:00Z`).getTime() / 1000)

  const origin = params.from_name
  const destination = params.to_name

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', origin)
  url.searchParams.set('destination', destination)
  url.searchParams.set('mode', 'transit')
  url.searchParams.set('departure_time', String(departUnix))
  url.searchParams.set('alternatives', 'true')
  url.searchParams.set('key', apiKey)

  let data: GDResponse
  try {
    const res = await fetch(url.toString())
    data = (await res.json()) as GDResponse
  } catch (err) {
    console.error('[google-transit-city] fetch error:', err)
    return []
  }

  if (data.status !== 'OK' || !data.routes?.length) {
    if (data.status !== 'ZERO_RESULTS') {
      console.error('[google-transit-city] status:', data.status, data.error_message ?? '')
    }
    return []
  }

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`

  const results: TravelOption[] = []

  for (const route of data.routes) {
    const leg = route.legs[0]
    if (!leg?.departure_time || !leg?.arrival_time) continue

    const departAt = toIso(leg.departure_time.value)
    const arriveAt = toIso(leg.arrival_time.value)
    const mode = dominantMode(leg.steps)
    const carrier = routeCarrier(leg.steps)
    const legRef = routeLegRef(leg.steps)

    results.push({
      mode,
      depart_at: departAt,
      arrive_at: arriveAt,
      carrier,
      carrier_logo_url: null,
      leg_ref: legRef,
      transit_min: 0,
      ground_min: 0,
      door_to_site_at: arriveAt,
      feasible: true,
      book_url: mapsUrl,
      ground_transit: null,
      raw: { provider: 'google-transit', route },
    })
  }

  return results
}

export async function searchGoogleTransit(
  params: GoogleTransitParams
): Promise<GroundTransit | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  const hasDestination = params.dest_address || (params.dest_lat != null && params.dest_lng != null)
  if (!apiKey || !hasDestination) return null

  const departUnix = Math.floor(new Date(params.depart_after).getTime() / 1000)

  // Use airport/station name as origin text when provided. The Directions API
  // resolves named places more reliably than raw coordinates for airports —
  // coordinates can miss the terminal transit connections that named places pick up.
  const origin = params.origin_name ?? `${params.origin_lat},${params.origin_lng}`

  // Prefer geocoded coordinates for destination — more precise than address text
  // for smaller cities where Google's GTFS may not resolve street addresses.
  const destination =
    params.dest_lat != null && params.dest_lng != null
      ? `${params.dest_lat},${params.dest_lng}`
      : params.dest_address

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', origin)
  url.searchParams.set('destination', destination)
  url.searchParams.set('mode', 'transit')
  url.searchParams.set('departure_time', String(departUnix))
  url.searchParams.set('alternatives', 'true')
  url.searchParams.set('key', apiKey)

  let data: GDResponse
  try {
    const res = await fetch(url.toString())
    data = (await res.json()) as GDResponse
  } catch (err) {
    console.error('[google-transit] fetch error:', err)
    return null
  }

  if (data.status !== 'OK' || !data.routes[0]?.legs[0]) {
    console.error(
      '[google-transit] status:', data.status,
      data.error_message ?? '',
      '| origin_sent:', origin,
      '| dest_sent:', destination,
      '| depart:', params.depart_after,
    )
    return null
  }

  // Use the first (best) route.
  const leg = data.routes[0].legs[0]

  const steps = insertWaits(leg.steps, leg.departure_time.value)

  // Filter out zero-duration noise.
  const cleanSteps = steps.filter(s => s.duration_min > 0)

  return {
    depart_at: toIso(leg.departure_time.value),
    arrive_at: toIso(leg.arrival_time.value),
    duration_min: Math.round(leg.duration.value / 60),
    steps: cleanSteps,
    // Maps link uses the same origin/destination so it opens the same route.
    maps_url: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`,
  }
}
