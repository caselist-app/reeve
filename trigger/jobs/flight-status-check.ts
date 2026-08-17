import { schedules } from '@trigger.dev/sdk/v3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupFlightByNumber, AirLabsRateLimitError, type FlightStatus } from '@/lib/logistics/adapters/airlabs'
import { formatFlightNumber } from '@/lib/utils/format-flight-number'
import { notify, type NotifyResult } from '@/lib/comms/notify'
import { notifyAccount } from '@/lib/comms/notify/account'
import { registry } from '@/lib/comms/notify/registry'
import type { NotifyContact } from '@/lib/comms/notify/types'
import { bustTourContextCache } from '@/lib/ai/context'
import type { Database } from '@/lib/types/database'

type Client = SupabaseClient<Database>

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
// specific people yet (that's a documented fast-follow), plus the tour's
// account holder via notifyAccount() (REE-237): the TM is watching the same
// flight and should hear about it the same way crew does, not find out from
// a crew member forwarding the message on.
//
// The segment's own state only advances once every recipient has genuinely
// received the alert or had nothing to deliver to (see the delivery gate
// below) - never on the strength of the AirLabs lookup alone.
//
// Split out from the schedules.task wrapper (REE-237, same reasoning as
// runExtraction in extract-forward.ts) so it runs against a real Postgres in
// a test with no Trigger.dev runtime involved: the SDK's Task object exposes
// no in-process way to invoke `run`, only trigger()/triggerAndWait(), which
// need a live API client. lookupFlightByNumber (AirLabs) and
// sendTelegramRendered (inside notify()/notifyAccount()) are the only things
// that need stubbing.
export async function runFlightStatusCheck(admin: Client) {
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

  // Cache the tour roster per tour_id so a run touching several segments on
  // the same tour doesn't re-query it each time. Selects each person's
  // contact row alongside the id, in the same query, so notify() below can
  // be passed the contact directly instead of re-running the people ->
  // contacts join once per person per changed segment (REE-265, same
  // reasoning as send-day-message.ts's REE-108 fix).
  const rosterCache = new Map<string, string[]>()
  const contactCache = new Map<string, Map<string, NotifyContact | null>>()
  async function rosterFor(tourId: string): Promise<string[]> {
    const cached = rosterCache.get(tourId)
    if (cached) return cached
    const { data } = await admin
      .from('people')
      .select('id, contacts(name, whatsapp_number, telegram_chat_id, contact_email, operational_channel, email_enabled)')
      .eq('tour_id', tourId)
    const rows = data ?? []
    const ids = rows.map((p) => p.id)
    rosterCache.set(tourId, ids)
    contactCache.set(tourId, new Map(rows.map((p) => [p.id, p.contacts as NotifyContact | null])))
    return ids
  }
  function contactFor(tourId: string, personId: string): NotifyContact | null {
    return contactCache.get(tourId)?.get(personId) ?? null
  }

  // Cached the same way: the account holder is a second recipient of the
  // same alert (below).
  const accountCache = new Map<string, string | null>()
  async function accountFor(tourId: string): Promise<string | null> {
    if (accountCache.has(tourId)) return accountCache.get(tourId)!
    const { data } = await admin.from('tours').select('account_id').eq('id', tourId).single()
    const accountId = data?.account_id ?? null
    accountCache.set(tourId, accountId)
    return accountId
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

    // Nothing changed: only the freshness marker moves (the UI's live/grey
    // distinction depends on its presence). Nobody to notify, so the
    // delivery gate below doesn't apply.
    if (!changed) {
      await admin
        .from('transport_segments')
        .update({ last_tracked_at: new Date().toISOString() })
        .eq('id', segment.id)
      continue
    }

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
    const crewResults: NotifyResult[] = []
    for (const personId of personIds) {
      crewResults.push(
        await notify({
          tourId: segment.tour_id,
          personId,
          type: 'flight_status_alert',
          data: { message },
          dedupDimension,
          contact: contactFor(segment.tour_id, personId),
        })
      )
    }

    // The TM hears about their own tour's flight the same way crew does.
    // notifyAccount renders straight from the registry rather than through
    // notify()'s people->contacts join, since the recipient here is the
    // account holder, not a person on the roster.
    const accountId = await accountFor(segment.tour_id)
    let accountOutcome: 'sent' | 'skipped_already_sent' | 'no_channel' | 'failed' | null = null
    if (accountId) {
      const rendered = await registry.flight_status_alert.telegram!({ message })
      const accountResult = await notifyAccount({
        tourId: segment.tour_id,
        accountId,
        type: 'flight_status_alert',
        dedupDimension,
        rendered,
      })
      accountOutcome = accountResult.outcome
    }

    // Deliver before persisting: the segment's diffed state is only
    // written once every recipient - every crew person and the account
    // holder - has genuinely received the alert or had nothing to deliver
    // to (no channel, or an already-sent claim for this exact dimension).
    // A 'failed' outcome on any channel withholds the whole write:
    // last_tracked_at still moves, recording that the poll happened, but
    // flight_status/gate/terminal/actual_* stay on their old values so the
    // next run recomputes the same diff and retries the same sends,
    // rather than a failed send masquerading as a delivered one.
    const crewDelivered = crewResults.every((r) => r.channels.every((c) => c.outcome !== 'failed'))
    const accountDelivered = accountOutcome !== 'failed'
    const delivered = crewDelivered && accountDelivered

    if (!delivered) {
      console.error(`[flight-status-check] delivery incomplete for segment ${segment.id}, withholding state write for retry`)
    }

    await admin
      .from('transport_segments')
      .update(delivered ? { ...next, last_tracked_at: new Date().toISOString() } : { last_tracked_at: new Date().toISOString() })
      .eq('id', segment.id)

    // Only once the write above has actually landed the new flight_status/
    // gate/terminal (REE-239): crew Q&A reads through assembleTourContext's
    // 10-minute cache, so without this a delay that just alerted everyone
    // over Telegram would still answer "on time" to a direct question for up
    // to another 10 minutes.
    if (delivered) {
      void bustTourContextCache(segment.tour_id)
    }
  }

  return { polled: segments.length, changed: changedCount, rateLimited }
}

export const flightStatusCheckJob = schedules.task({
  id: 'flight-status-check',
  cron: '0 */6 * * *',
  run: async () => {
    return runFlightStatusCheck(createAdminClient())
  },
})
