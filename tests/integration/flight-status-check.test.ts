import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// Only the two boundaries are stubbed: the AirLabs lookup (the job's one
// external HTTP call, per the adapter's file header) and the Telegram send
// (inside notify()/notifyAccount()). Everything else - the claim, the dedup
// index, the release-on-failure, the transport_segments diff and write - runs
// against real Postgres, because that is exactly what REE-237 is about:
// whether a failed send can still leave the segment's state advanced.
vi.mock('@/lib/logistics/adapters/airlabs', () => ({
  lookupFlightByNumber: vi.fn(),
  AirLabsRateLimitError: class AirLabsRateLimitError extends Error {},
}))

vi.mock('@/lib/comms/notify/adapters/telegram', () => ({
  sendTelegramRendered: vi.fn(),
}))

import { lookupFlightByNumber, type NormalizedFlightLookup } from '@/lib/logistics/adapters/airlabs'
import { sendTelegramRendered } from '@/lib/comms/notify/adapters/telegram'
import { runFlightStatusCheck } from '@/trigger/jobs/flight-status-check'

const mockLookup = vi.mocked(lookupFlightByNumber)
const mockSend = vi.mocked(sendTelegramRendered)

const PERSON_CHAT_ID = 111222333
const ACCOUNT_CHAT_ID = 987654321
const FLIGHT_NO = 'TA123'

// Two hours out, so it always lands inside the job's poll window
// (24h-before to 6h-after now) regardless of when the suite runs.
function departingSoon(): string {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
}

function lookupResponse(departAt: string, overrides: Partial<NormalizedFlightLookup> = {}): NormalizedFlightLookup {
  return {
    airline_name: 'Test Air',
    airline_iata: 'TA',
    flight_iata: FLIGHT_NO,
    origin_iata: 'LHR',
    destination_iata: 'JFK',
    origin_name: null,
    destination_name: null,
    dep_terminal: '5',
    dep_gate: 'A1',
    arr_terminal: null,
    arr_gate: null,
    dep_time_local: null,
    arr_time_local: null,
    dep_time_utc: departAt,
    arr_time_utc: null,
    flight_status: 'cancelled',
    actual_depart_at: null,
    actual_arrive_at: null,
    raw: {},
    ...overrides,
  }
}

async function seedFlightSegment(tourId: string, departAt: string): Promise<string> {
  const { data, error } = await testDb
    .from('transport_segments')
    .insert({
      tour_id: tourId,
      mode: 'flight',
      vehicle_or_flight_no: FLIGHT_NO,
      depart_at: departAt,
      origin: 'LHR',
      destination: 'JFK',
      flight_status: 'scheduled',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed: could not create transport_segment: ${error?.message}`)
  return data.id
}

async function segmentRow(segmentId: string) {
  const { data, error } = await testDb
    .from('transport_segments')
    .select('flight_status, gate, terminal, actual_depart_at, actual_arrive_at')
    .eq('id', segmentId)
    .single()
  if (error || !data) throw new Error(`could not read transport_segment: ${error?.message}`)
  return data
}

async function flightAlertLog(tourId: string) {
  const { data, error } = await testDb
    .from('notification_log')
    .select('id, person_id, account_id, channel, status')
    .eq('tour_id', tourId)
    .eq('notification_type', 'flight_status_alert')
  if (error) throw new Error(`could not read notification_log: ${error.message}`)
  return data ?? []
}

// REE-237. Before this fix, flight-status-check.ts wrote the diffed segment
// state (flight_status/gate/terminal/actual_*) unconditionally right after
// the AirLabs lookup, then fired notify() at whoever it happened to reach -
// crew only, never the TM's own Telegram. A failed send left the segment
// looking current while nobody had actually heard about it, and the TM never
// got the alert at all. The fix: the diffed state only writes once every
// recipient - every crew person and the tour's account holder - has
// genuinely received the alert or had nothing to deliver to.
describe('flight-status-check delivers before persisting, and reaches the TM too', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()

    // The crew person's operational channel, so notify() has somewhere to send.
    const { error } = await testDb
      .from('contacts')
      .update({ telegram_chat_id: PERSON_CHAT_ID, operational_channel: 'telegram' })
      .eq('id', fixture.contactId)
    if (error) throw new Error(`seed: could not set contact telegram_chat_id: ${error.message}`)

    mockLookup.mockReset()
    mockSend.mockReset()
    mockSend.mockResolvedValue({ providerMessageId: 'tg-msg-1' })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('a. full delivery advances the segment and notifies crew and the account holder', async () => {
    const { error: accountError } = await testDb
      .from('accounts')
      .update({ telegram_chat_id: ACCOUNT_CHAT_ID })
      .eq('id', fixture.userId)
    if (accountError) throw new Error(`seed: could not set account telegram_chat_id: ${accountError.message}`)

    const departAt = departingSoon()
    const segmentId = await seedFlightSegment(fixture.tourId, departAt)
    mockLookup.mockResolvedValue(lookupResponse(departAt))

    await runFlightStatusCheck(testDb)

    const segment = await segmentRow(segmentId)
    expect(segment.flight_status).toBe('cancelled')

    const rows = await flightAlertLog(fixture.tourId)
    const personRow = rows.find((r) => r.person_id === fixture.personId)
    const accountRow = rows.find((r) => r.account_id === fixture.userId)

    expect(personRow?.channel).toBe('telegram')
    expect(personRow?.status).toBe('sent')

    expect(accountRow).toBeDefined()
    expect(accountRow?.channel).toBe('telegram')
    expect(accountRow?.status).toBe('sent')
    expect(accountRow?.person_id).toBeNull()
  })

  it('b. a failed send withholds the write, and is retried on the next poll', async () => {
    const { error: accountError } = await testDb
      .from('accounts')
      .update({ telegram_chat_id: ACCOUNT_CHAT_ID })
      .eq('id', fixture.userId)
    if (accountError) throw new Error(`seed: could not set account telegram_chat_id: ${accountError.message}`)

    const departAt = departingSoon()
    const segmentId = await seedFlightSegment(fixture.tourId, departAt)
    mockLookup.mockResolvedValue(lookupResponse(departAt))

    // The crew send is the first Telegram send the run attempts (the roster
    // loop runs before the account notify), and it throws.
    mockSend.mockRejectedValueOnce(new Error('telegram is down'))

    await runFlightStatusCheck(testDb)

    const afterFailedRun = await segmentRow(segmentId)
    expect(afterFailedRun.flight_status).toBe('scheduled')

    const rowsAfterFailedRun = await flightAlertLog(fixture.tourId)
    expect(rowsAfterFailedRun.find((r) => r.person_id === fixture.personId)).toBeUndefined()

    // Un-mock the send and poll again with the same AirLabs response: the
    // stored segment is still 'scheduled', so the diff is recomputed and the
    // same sends are retried.
    await runFlightStatusCheck(testDb)

    const afterRetry = await segmentRow(segmentId)
    expect(afterRetry.flight_status).toBe('cancelled')

    const rowsAfterRetry = await flightAlertLog(fixture.tourId)
    const personRowAfterRetry = rowsAfterRetry.find((r) => r.person_id === fixture.personId)
    expect(personRowAfterRetry?.status).toBe('sent')
  })

  it('c. an unchanged poll does not re-notify', async () => {
    const { error: accountError } = await testDb
      .from('accounts')
      .update({ telegram_chat_id: ACCOUNT_CHAT_ID })
      .eq('id', fixture.userId)
    if (accountError) throw new Error(`seed: could not set account telegram_chat_id: ${accountError.message}`)

    const departAt = departingSoon()
    const segmentId = await seedFlightSegment(fixture.tourId, departAt)
    mockLookup.mockResolvedValue(lookupResponse(departAt))

    await runFlightStatusCheck(testDb)
    const afterFirstRun = await segmentRow(segmentId)
    const rowsAfterFirstRun = await flightAlertLog(fixture.tourId)
    expect(rowsAfterFirstRun).toHaveLength(2)

    // Identical mocked response: nothing about the flight has actually
    // changed since the first run persisted it.
    await runFlightStatusCheck(testDb)

    const afterSecondRun = await segmentRow(segmentId)
    const rowsAfterSecondRun = await flightAlertLog(fixture.tourId)

    expect(rowsAfterSecondRun).toHaveLength(2)
    expect(afterSecondRun).toEqual(afterFirstRun)
  })

  it('d. an unlinked TM does not block the write', async () => {
    // accounts.telegram_chat_id is left null: no /start link yet.
    const departAt = departingSoon()
    const segmentId = await seedFlightSegment(fixture.tourId, departAt)
    mockLookup.mockResolvedValue(lookupResponse(departAt, { flight_status: 'delayed', dep_gate: 'B2' }))

    await runFlightStatusCheck(testDb)

    const segment = await segmentRow(segmentId)
    expect(segment.flight_status).toBe('delayed')

    const rows = await flightAlertLog(fixture.tourId)
    expect(rows.some((r) => r.account_id === fixture.userId)).toBe(false)
    expect(rows.some((r) => r.person_id === fixture.personId && r.status === 'sent')).toBe(true)
  })
})
