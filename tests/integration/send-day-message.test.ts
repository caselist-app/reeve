import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createDayItem } from '@/lib/actions/day-items'

// Nothing in this repo has ever tested notify(), notification_log or any send
// path before this file (REE-102). Only the three provider boundaries are
// stubbed: everything else, the show lookup, the day items, the block
// selection, resolveChannels and the claim/send/release loop inside notify(),
// runs for real against Postgres.
vi.mock('@/lib/comms/notify/adapters/whatsapp', () => ({
  sendWhatsAppRendered: vi.fn(),
}))
vi.mock('@/lib/comms/notify/adapters/email', () => ({
  sendEmailRendered: vi.fn(),
}))
vi.mock('@/lib/comms/notify/adapters/telegram', () => ({
  sendTelegramRendered: vi.fn(),
}))

import { sendWhatsAppRendered } from '@/lib/comms/notify/adapters/whatsapp'
import { sendEmailRendered } from '@/lib/comms/notify/adapters/email'
import { sendTelegramRendered } from '@/lib/comms/notify/adapters/telegram'
import { sendDayMessage } from '@/lib/comms/send-day-message'

const mockWhatsApp = vi.mocked(sendWhatsAppRendered)
const mockEmail = vi.mocked(sendEmailRendered)
const mockTelegram = vi.mocked(sendTelegramRendered)

const DATE = '2030-06-14'
const TIMEZONE = 'Europe/London'

// A stagger that resolves instantly, so the block-send loop runs at test
// speed instead of Trigger.dev's real wait.for, which only works inside an
// actual triggered run.
const noStagger = async () => {}

async function seedShowDayItems(fixture: Fixture) {
  for (const [kind, clock, endClock] of [
    ['load_in', '10:00', undefined],
    ['soundcheck', '11:00', undefined],
    ['catering_lunch', '12:00', '13:00'],
    ['curfew', '23:00', undefined],
  ] as const) {
    const seeded = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind,
      start_clock: clock,
      ...(endClock ? { end_clock: endClock } : {}),
    })
    if (seeded.error) throw new Error(`could not seed ${kind}: ${seeded.error}`)
  }

  const { error } = await testDb
    .from('shows')
    .update({ catering_type: 'provided' })
    .eq('id', fixture.showId)
  if (error) throw new Error(`could not set catering_type: ${error.message}`)
}

async function addPerson(
  fixture: Fixture,
  opts: {
    name: string
    whatsappNumber?: string
    contactEmail?: string
    operationalChannel?: 'whatsapp' | 'telegram'
    emailEnabled?: boolean
  }
): Promise<string> {
  const { data: contact, error: contactError } = await testDb
    .from('contacts')
    .insert({
      account_id: fixture.userId,
      name: opts.name,
      whatsapp_number: opts.whatsappNumber ?? null,
      contact_email: opts.contactEmail ?? null,
      operational_channel: opts.operationalChannel ?? null,
      email_enabled: opts.emailEnabled ?? false,
    })
    .select('id')
    .single()
  if (contactError || !contact) throw new Error(`could not seed contact: ${contactError?.message}`)

  const { data: person, error: personError } = await testDb
    .from('people')
    .insert({ tour_id: fixture.tourId, contact_id: contact.id, person_type: 'crew' })
    .select('id')
    .single()
  if (personError || !person) throw new Error(`could not seed person: ${personError?.message}`)

  return person.id
}

async function notificationLog(tourId: string, dedupDimension: string) {
  const { data, error } = await testDb
    .from('notification_log')
    .select('person_id, notification_type, channel, status')
    .eq('tour_id', tourId)
    .eq('dedup_dimension', dedupDimension)
  if (error) throw new Error(`could not read notification_log: ${error.message}`)
  return data ?? []
}

describe('sendDayMessage', () => {
  let fixture: Fixture
  // Each real provider send returns its own unique message id; notify()
  // writes it into notification_log.provider_message_id, now under a unique
  // index (REE-274). A fixed mock value across every call in a test, which
  // sends several blocks and several people per run, made that write collide
  // with itself and silently fail (the update's error goes unchecked), so
  // these mirror the real per-send uniqueness instead.
  let whatsappSeq = 0
  let emailSeq = 0
  let telegramSeq = 0

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE, timezone: TIMEZONE })

    mockWhatsApp.mockReset()
    mockEmail.mockReset()
    mockTelegram.mockReset()
    whatsappSeq = 0
    emailSeq = 0
    telegramSeq = 0
    mockWhatsApp.mockImplementation(async () => ({ providerMessageId: `wamid-${++whatsappSeq}` }))
    mockEmail.mockImplementation(async () => ({ providerMessageId: `resend-${++emailSeq}` }))
    mockTelegram.mockImplementation(async () => ({ providerMessageId: `tg-${++telegramSeq}` }))
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('sends the block sequence to a WhatsApp contact and the digest to an email contact, and skips a contact with no channel', async () => {
    await seedShowDayItems(fixture)

    const whatsappPersonId = await addPerson(fixture, {
      name: 'WhatsApp Crew',
      whatsappNumber: '+447700900001',
      operationalChannel: 'whatsapp',
      emailEnabled: false,
    })
    const emailPersonId = await addPerson(fixture, {
      name: 'Email Crew',
      contactEmail: 'email-crew@example.test',
      emailEnabled: true,
    })
    // fixture.personId ("Test Crew") has no whatsapp number, telegram id or
    // email set: the no-channel case.

    const result = await sendDayMessage({
      tourId: fixture.tourId,
      date: DATE,
      timezone: TIMEZONE,
      artistName: 'Test Artist',
      dedupDimension: DATE,
      stagger: noStagger,
    })

    expect(result.skipped).toBeUndefined()

    const rows = await notificationLog(fixture.tourId, DATE)

    const whatsappRows = rows.filter((r) => r.person_id === whatsappPersonId)
    expect(whatsappRows.map((r) => r.notification_type).sort()).toEqual(
      ['catering', 'opener', 'show_information', 'wrap'].sort()
    )
    expect(whatsappRows.every((r) => r.channel === 'whatsapp' && r.status === 'sent')).toBe(true)
    expect(whatsappRows.some((r) => r.notification_type === 'morning_message')).toBe(false)

    const emailRows = rows.filter((r) => r.person_id === emailPersonId)
    expect(emailRows).toHaveLength(1)
    expect(emailRows[0].notification_type).toBe('morning_message')
    expect(emailRows[0].channel).toBe('email')
    expect(emailRows[0].status).toBe('sent')

    const noChannelRows = rows.filter((r) => r.person_id === fixture.personId)
    expect(noChannelRows).toHaveLength(0)
    expect(result.failures.some((f) => f.person_id === fixture.personId)).toBe(false)
    expect(result.results.some((r) => r.person_id === fixture.personId)).toBe(false)
  })

  // Bug B: two shows on one tour_date_id. Nothing in the schema prevents it,
  // and .maybeSingle() errors rather than returning a row on more than one
  // match. The error used to be discarded and the job returned no_show_today,
  // sending nothing with no sign anything was wrong.
  it('reports two_shows rather than no_show_today when a date carries two shows', async () => {
    const { error: secondShowError } = await testDb.from('shows').insert({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      date: DATE,
      venue_name: 'Second Venue',
    })
    if (secondShowError) throw new Error(`could not seed second show: ${secondShowError.message}`)

    const result = await sendDayMessage({
      tourId: fixture.tourId,
      date: DATE,
      timezone: TIMEZONE,
      artistName: 'Test Artist',
      dedupDimension: DATE,
      stagger: noStagger,
    })

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('two_shows')

    const rows = await notificationLog(fixture.tourId, DATE)
    expect(rows).toHaveLength(0)
  })

  it('reports no_show_today when the date genuinely has no show', async () => {
    const { error } = await testDb.from('shows').delete().eq('id', fixture.showId)
    if (error) throw new Error(`could not remove seeded show: ${error.message}`)

    const result = await sendDayMessage({
      tourId: fixture.tourId,
      date: DATE,
      timezone: TIMEZONE,
      artistName: 'Test Artist',
      dedupDimension: DATE,
      stagger: noStagger,
    })

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('no_show_today')
  })

  // Bug A: the wrap block's onward-leg query window used to be built from
  // literal UTC midnight rather than the tour's own local midnight. Auckland
  // is 12 hours ahead of UTC in June (no DST), the same fixture zone
  // lib/schedule/datetime.test.ts uses to pin localDayWindowUtc, so a boundary
  // built from `${nextDay}T00:00:00Z` lands local NOON on nextDay rather than
  // local midnight: `2030-06-15T00:00:00Z` to `2030-06-16T00:00:00Z` covers
  // the second half of the local 15th and the first half of the local 16th,
  // exactly the drift the localDayWindowUtc unit tests pin.
  //
  // The leg below departs 20:00 local on the day after the show, deliberately
  // chosen (rather than the first post-midnight hour) to fall in the exact
  // window the bug drops: before the fixed boundary (local midnight starting
  // the day after that) but at or after the old UTC-midnight boundary
  // (2030-06-15T00:00:00Z, which reads as local noon on the 15th). Revert the
  // fix and this leg goes missing; anything closer to curfew is inside both
  // the buggy and the fixed window and would not tell the two apart.
  it('resolves a post-midnight onward leg for an Auckland tour', async () => {
    const auckland = await createFixture({ date: DATE, timezone: 'Pacific/Auckland', tourName: 'Auckland Tour' })

    try {
      await seedShowDayItems(auckland)

      const personId = await addPerson(auckland, {
        name: 'Auckland Crew',
        whatsappNumber: '+64211234567',
        operationalChannel: 'whatsapp',
      })

      const nextDate = '2030-06-15'
      const { data: segment, error: segmentError } = await testDb
        .from('transport_segments')
        .insert({
          tour_id: auckland.tourId,
          mode: 'ground',
          destination: 'Wellington',
          depart_at: `${nextDate}T20:00:00+12:00`,
          status: 'planned',
        })
        .select('id')
        .single()
      if (segmentError || !segment) throw new Error(`could not seed segment: ${segmentError?.message}`)

      const { error: assignmentError } = await testDb.from('transport_assignments').insert({
        tour_id: auckland.tourId,
        person_id: personId,
        segment_id: segment.id,
      })
      if (assignmentError) throw new Error(`could not seed assignment: ${assignmentError.message}`)

      await sendDayMessage({
        tourId: auckland.tourId,
        date: DATE,
        timezone: 'Pacific/Auckland',
        artistName: 'Test Artist',
        dedupDimension: DATE,
        stagger: noStagger,
      })

      // The wrap renderer only ever writes the destination into bodyParams on
      // the 'travel' variant (onward leg found); 'static' (curfew only) never
      // mentions it, and no other block's bodyParams could contain it. Found
      // by content rather than position or length, since the opener block
      // also renders four bodyParams and would otherwise collide with a
      // length-based check.
      const wrapCall = mockWhatsApp.mock.calls.find((call) => {
        const rendered = call[1]
        return rendered.kind === 'template' && rendered.bodyParams.includes('Wellington')
      })
      expect(wrapCall).toBeDefined()
    } finally {
      await destroyFixture(auckland)
    }
  })

  // REE-103: notification_log's unique index on (tour_id, person_id,
  // notification_type, channel, dedup_dimension) is what makes a retry safe,
  // but nothing had ever called sendDayMessage twice to prove it. This is the
  // retry-safety half: same dedupDimension, second call must skip every
  // channel and write nothing new, even though it still reports success.
  it('skips every channel and writes no new rows when a second send reuses the dedup dimension', async () => {
    await seedShowDayItems(fixture)

    await addPerson(fixture, {
      name: 'WhatsApp Crew',
      whatsappNumber: '+447700900010',
      operationalChannel: 'whatsapp',
    })

    const first = await sendDayMessage({
      tourId: fixture.tourId,
      date: DATE,
      timezone: TIMEZONE,
      artistName: 'Test Artist',
      dedupDimension: DATE,
      stagger: noStagger,
    })
    expect(first.skipped).toBeUndefined()

    const rowsAfterFirst = await notificationLog(fixture.tourId, DATE)
    expect(rowsAfterFirst.length).toBeGreaterThan(0)

    mockWhatsApp.mockClear()

    const second = await sendDayMessage({
      tourId: fixture.tourId,
      date: DATE,
      timezone: TIMEZONE,
      artistName: 'Test Artist',
      dedupDimension: DATE,
      stagger: noStagger,
    })

    // The exact silent success this brief exists to prevent: the function
    // still reports a healthy run against the same people, but every channel
    // it touched came back skipped_already_sent rather than sent.
    expect(second.skipped).toBeUndefined()
    expect(second.people_count).toBe(first.people_count)
    expect(second.results.length).toBeGreaterThan(0)
    expect(
      second.results.every((r) => r.channels.every((c) => c.outcome === 'skipped_already_sent'))
    ).toBe(true)
    expect(mockWhatsApp).not.toHaveBeenCalled()

    const rowsAfterSecond = await notificationLog(fixture.tourId, DATE)
    expect(rowsAfterSecond).toHaveLength(rowsAfterFirst.length)
  })

  // The re-send half: a resend has to mint its own dedup value, the way
  // sendBroadcast mints a fresh change_id per send (lib/actions/broadcast.ts,
  // rather than reusing the day's date). Two distinct dedup dimensions must
  // each get their own full set of notification_log rows, with no skips on
  // the second send and the first send's rows left untouched.
  it('sends a full new set with no skips when a resend mints a fresh dedup dimension', async () => {
    await seedShowDayItems(fixture)

    await addPerson(fixture, {
      name: 'WhatsApp Crew',
      whatsappNumber: '+447700900011',
      operationalChannel: 'whatsapp',
    })

    const firstDedup = `${DATE}:aaa`
    const secondDedup = `${DATE}:bbb`

    const first = await sendDayMessage({
      tourId: fixture.tourId,
      date: DATE,
      timezone: TIMEZONE,
      artistName: 'Test Artist',
      dedupDimension: firstDedup,
      stagger: noStagger,
    })
    expect(first.skipped).toBeUndefined()

    const rowsA = await notificationLog(fixture.tourId, firstDedup)
    expect(rowsA.length).toBeGreaterThan(0)

    const second = await sendDayMessage({
      tourId: fixture.tourId,
      date: DATE,
      timezone: TIMEZONE,
      artistName: 'Test Artist',
      dedupDimension: secondDedup,
      stagger: noStagger,
    })

    expect(second.skipped).toBeUndefined()
    expect(second.results.length).toBeGreaterThan(0)
    expect(second.results.every((r) => r.channels.every((c) => c.outcome === 'sent'))).toBe(true)

    const rowsB = await notificationLog(fixture.tourId, secondDedup)
    expect(rowsB).toHaveLength(rowsA.length)
    expect(rowsB.every((r) => r.status === 'sent')).toBe(true)

    // The resend did not touch or replace the original send's rows.
    const rowsAAfter = await notificationLog(fixture.tourId, firstDedup)
    expect(rowsAAfter).toHaveLength(rowsA.length)
  })

  // Bug C: per-person failures used to vanish into Promise.allSettled with
  // nothing reading the settled results, so a broken send for one person
  // looked identical to a healthy run.
  it('collects a per-person failure instead of discarding it', async () => {
    await seedShowDayItems(fixture)

    const whatsappPersonId = await addPerson(fixture, {
      name: 'Failing Crew',
      whatsappNumber: '+447700900002',
      operationalChannel: 'whatsapp',
    })

    // The stagger runs between blocks, inside the per-person task, so making
    // it throw is a way to fail this person's send without reaching into
    // notify()'s own try/catch.
    let calls = 0
    const throwingStagger = async () => {
      calls += 1
      throw new Error('stagger failed')
    }

    const result = await sendDayMessage({
      tourId: fixture.tourId,
      date: DATE,
      timezone: TIMEZONE,
      artistName: 'Test Artist',
      dedupDimension: DATE,
      stagger: throwingStagger,
    })

    expect(calls).toBeGreaterThan(0)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].person_id).toBe(whatsappPersonId)
    expect(result.failures[0].error).toContain('stagger failed')
  })
})
