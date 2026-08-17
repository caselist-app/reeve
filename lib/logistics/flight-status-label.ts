import type { FlightStatus } from '@/lib/logistics/adapters/airlabs'

// Human-readable label for a transport_segments.flight_status value, as
// surfaced to crew in /travel. Distinct from FLIGHT_STATUS_MESSAGE in
// trigger/jobs/flight-status-check.ts, which describes a change ("Now
// delayed.") rather than the current state ("Delayed").
const FLIGHT_STATUS_LABEL: Record<FlightStatus, string> = {
  scheduled: 'On time',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  departed: 'Departed',
  landed: 'Landed',
}

// flight_status is a plain text column, not a Postgres enum, so an unrecognised
// value returns null rather than a guessed label: the caller then omits the
// line entirely, matching the "no line for an unset field" convention.
export function flightStatusLabel(status: string | null): string | null {
  if (!status) return null
  return FLIGHT_STATUS_LABEL[status as FlightStatus] ?? null
}
