import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupFlightByNumber, AirLabsRateLimitError, type FlightStatus } from '@/lib/logistics/adapters/airlabs'
import { formatFlightNumber } from '@/lib/utils/format-flight-number'
import { notify } from '@/lib/comms/notify'

// How far ahead of scheduled departure to start polling, and how long after
// departure to keep polling (catches the "landed" confirmation on short/
// medium-haul flights; very long-haul flights may land after this window
// closes - a deliberate cost tradeoff given the free AirLabs plan's small
// monthly call budget, not an oversight). Every in-window segment costs
// exactly one AirLabs call per run, whether or not anything changed - tune
// these two numbers first if the monthly quota becomes the constraint.
const POLL_WINDOW_HOURS_BEFORE = 24
const POLL_WINDOW_HOURS_AFTER = 6

// A lookup is only trusted as describing THIS segment (not some other day's
// occurrence of the same flight number - see the adapter's file header) if
// its departure time lands within this many hours of the segment's stored
// depart_at. Wider than a strict same-calendar-date check so it isn't fooled
// by UTC midnight boundaries; narrower than a full day so a genuinely
// different day's flight can never pass.
const SAME_FLIGHT_TOLERANCE_HOURS = 20

const FLIGHT_STATUS_MESSAGE: Record<FlightStatus, string> = {
  scheduled: 'Now on time.',
  delayed: 'Now delayed.',
  cancelled: 'Cancelled.',
  departed: 'Departed.',
  landed: 'Landed.',
}

type TrackedSegment = {
  id: string
  tour_id: string
  origin: string | null
  destination: string | null
  vehicle_or_flight_no: string | null
  depart_at: string | null
  flight_status: string | null
  gate: string | null
  terminal: string | null
  actual_depart_at: string | null
  actual_arrive_at: string | null
}

function buildAlertMessage(
  segment: TrackedSegment,
  next: { flight_status: FlightStatus; gate: string | null; terminal: string | null }
): string {
  const lines: string[] = []

  if (next.flight_status !== segment.flight_status) {
    lines.push(FLIGHT_STATUS_MESSAGE[next.flight_status])
  }
  if (next.gate && next.gate !== segment.gate) {
    lines.push(`Gate: ${next.gate}`)
  }
  if (next.terminal && next.terminal !== segment.terminal) {
    lines.push(`Terminal: ${next.terminal}`)
  }

  const route = [segment.origin, segment.destination].filter(Boolean).join(' to ')
  const detail = lines.length > 0 ? lines.join(' ') : 'Status updated.'
  return `Flight update: ${formatFlightNumber(segment.vehicle_or_flight_no)}${route ? ` (${route})` : ''}\n${detail}`
}

// Polls AirLabs for every flight segment inside the tracking window, diffs
// the response against what's stored, and fires flight_status_alert through
// notify() only on a real change - never on every poll. Always-on: no tour
// flag gates this (Brief 31: disruption info for a flight already on the
// schedule is core value, not an optional broadcast). Recipients are every
// contactable person on the tour, the same day_sheet-style broadcast
// lib/comms/affected.ts already uses, since flights aren't assigned to
// specific people yet (that's a documented fast-follow).
export const flightStatusCheckJob = schedules.task({
  id: 'flight-status-check',
  cron: '0 */6 * * *',
  run: async () => {
    const admin = createAdminClient()
    const now = Date.now()
    const windowStart = new Date(now - POLL_WINDOW_HOURS_AFTER * 60 * 60 * 1000).toISOString()
    const windowEnd = new Date(now + POLL_WINDOW_HOURS_BEFORE * 60 * 60 * 1000).toISOString()

    const { data: segments } = await admin
      .from('transport_segments')
      .select('id, tour_id, origin, destination, vehicle_or_flight_no, depart_at, flight_status, gate, terminal, actual_depart_at, actual_arrive_at')
      .eq('mode', 'flight')
      .not('depart_at', 'is', null)
      .gte('depart_at', windowStart)
      .lte('depart_at', windowEnd)

    if (!segments || segments.length === 0) {
      return { polled: 0, changed: 0 }
    }

    // Cache the tour roster per tour_id so a run touching several segments
    // on the same tour doesn't re-query it each time.
    const rosterCache = new Map<string, string[]>()
    async function rosterFor(tourId: string): Promise<string[]> {
      const cached = rosterCache.get(tourId)
      if (cached) return cached
      const { data } = await admin.from('people').select('id').eq('tour_id', tourId)
      const ids = (data ?? []).map((p) => p.id)
      rosterCache.set(tourId, ids)
      return ids
    }

    let changedCount = 0
    let rateLimited = false

    for (const segment of segments as TrackedSegment[]) {
      if (rateLimited) break
      if (!segment.vehicle_or_flight_no) continue

      let lookup
      try {
        lookup = await lookupFlightByNumber(segment.vehicle_or_flight_no)
      } catch (err) {
        if (err instanceof AirLabsRateLimitError) {
          // Stop burning further calls this run; remaining segments get
          // picked up on the next scheduled run.
          rateLimited = true
          console.error('[flight-status-check] AirLabs rate limit hit, stopping run early', err.message)
          break
        }
        console.error(`[flight-status-check] Lookup failed for segment ${segment.id}`, err)
        continue
      }

      if (!lookup) continue

      // Guard against a lookup describing a different day's occurrence of
      // the same flight number (see the adapter's file header) - only trust
      // it once it's genuinely close to this segment's own departure.
      if (!lookup.dep_time_utc) continue
      const hoursApart = Math.abs(new Date(lookup.dep_time_utc).getTime() - new Date(segment.depart_at!).getTime()) / (60 * 60 * 1000)
      if (hoursApart > SAME_FLIGHT_TOLERANCE_HOURS) continue

      const next = {
        flight_status: lookup.flight_status,
        gate: lookup.dep_gate,
        terminal: lookup.dep_terminal,
        actual_depart_at: lookup.actual_depart_at,
        actual_arrive_at: lookup.actual_arrive_at,
      }

      const changed =
        next.flight_status !== segment.flight_status ||
        next.gate !== segment.gate ||
        next.terminal !== segment.terminal ||
        next.actual_depart_at !== segment.actual_depart_at ||
        next.actual_arrive_at !== segment.actual_arrive_at

      // Always refresh last_tracked_at on a successful in-window poll (the
      // UI's live/grey distinction depends on its presence), even when
      // nothing changed. Only notify on a real change.
      await admin
        .from('transport_segments')
        .update({ ...next, last_tracked_at: new Date().toISOString() })
        .eq('id', segment.id)

      if (!changed) continue
      changedCount++

      const message = buildAlertMessage(segment, next)
      // Dedup dimension is derived from the new state itself: the same
      // combination of values can never notify twice (protects against
      // double-sends on retry), but any genuinely new combination - even a
      // second delay on the same segment - gets its own notification.
      const dedupDimension = [
        segment.id,
        next.flight_status,
        next.gate ?? '',
        next.terminal ?? '',
        next.actual_depart_at ?? '',
        next.actual_arrive_at ?? '',
      ].join(':')

      const personIds = await rosterFor(segment.tour_id)
      for (const personId of personIds) {
        await notify({
          tourId: segment.tour_id,
          personId,
          type: 'flight_status_alert',
          data: { message },
          dedupDimension,
        })
      }
    }

    return { polled: segments.length, changed: changedCount, rateLimited }
  },
})
