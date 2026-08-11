import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { previewShowRemoval, deleteShowAndResend } from '@/lib/actions/shows'

// REE-94. The old removal dialog guessed at what goes with a show: "its running
// order" claimed every item on the day, when a hand-added running-order item
// with no show_id survives the cascade. On the live database on 2026-08-11, a
// delete-cascade count came back 5 while 23 day_items carried no show_id at all,
// so counting every item on the day was not a rounding error, it was routinely
// off by more than the thing it was counting.
//
// So previewShowRemoval states counted facts, and the assertion that matters is
// the negative one: cascadingItemCount is the items that carry THIS show, and
// not the items on the day. Seed four, of which two are the show's, and the copy
// must say two.
describe('the show-removal preview counts only what cascades', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()

    // Four items on the one day. Two carry the show's show_id (they cascade with
    // it), two do not (a running order a TM hand-added, which survives). Distinct
    // kinds so a stray unique constraint could not collapse them.
    const { error: itemsError } = await testDb.from('day_items').insert([
      { tour_id: fixture.tourId, tour_date_id: fixture.tourDateId, show_id: fixture.showId, kind: 'load_in' },
      { tour_id: fixture.tourId, tour_date_id: fixture.tourDateId, show_id: fixture.showId, kind: 'soundcheck' },
      { tour_id: fixture.tourId, tour_date_id: fixture.tourDateId, show_id: null, kind: 'lobby_call' },
      { tour_id: fixture.tourId, tour_date_id: fixture.tourDateId, show_id: null, kind: 'other', title: 'Crew call' },
    ])
    if (itemsError) throw new Error(`seed: could not create day_items: ${itemsError.message}`)

    // Transport linked to the day, so the fallback is a travel day rather than a
    // day off. Its own row rather than an assignment, because the fallback is
    // decided by whether anything is on the day, the same read revertDayType-
    // IfOrphaned does.
    const { error: segmentError } = await testDb
      .from('transport_segments')
      .insert({ tour_id: fixture.tourId, tour_date_id: fixture.tourDateId, mode: 'bus' })
    if (segmentError) throw new Error(`seed: could not create transport_segment: ${segmentError.message}`)

    // Two more people, so the roster is three. The delete must not touch them.
    for (const name of ['Second Crew', 'Third Crew']) {
      const { data: contact, error: contactError } = await testDb
        .from('contacts')
        .insert({ account_id: fixture.userId, name })
        .select('id')
        .single()
      if (contactError || !contact) throw new Error(`seed: could not create contact: ${contactError?.message}`)

      const { error: personError } = await testDb
        .from('people')
        .insert({ tour_id: fixture.tourId, contact_id: contact.id, person_type: 'crew' })
      if (personError) throw new Error(`seed: could not create person: ${personError.message}`)
    }
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('counts the two items that carry the show, not all four on the day', async () => {
    // The whole point of the brief. A version that counted every item on the day
    // would return 4, which is the copy overstating the cascade. Prove the day
    // really does hold four first, so this is a live distinction and not an
    // accident of an empty table.
    const { count: allOnDay } = await testDb
      .from('day_items')
      .select('id', { count: 'exact', head: true })
      .eq('tour_date_id', fixture.tourDateId)
    expect(allOnDay).toBe(4)

    const preview = await previewShowRemoval(fixture.showId)

    expect(preview.error).toBeNull()
    expect(preview.cascadingItemCount).toBe(2)
    expect(preview.cascadingItemCount).not.toBe(4)
    expect(preview.venueName).toBe('Test Venue')
  })

  it('reads the fallback off the transport linked to the day', async () => {
    const withSegment = await previewShowRemoval(fixture.showId)
    expect(withSegment.fallbackDayType).toBe('travel')

    // Remove the transport, and the day has nothing to fall back to but a day off.
    const { error } = await testDb
      .from('transport_segments')
      .delete()
      .eq('tour_id', fixture.tourId)
    if (error) throw new Error(`could not delete transport_segment: ${error.message}`)

    const withoutSegment = await previewShowRemoval(fixture.showId)
    expect(withoutSegment.fallbackDayType).toBe('day_off')
  })

  it('deletes the show and its items, keeps the hand-added items, reverts the day', async () => {
    const result = await deleteShowAndResend(fixture.showId, { resend: false })
    expect(result.error).toBeNull()

    // The show is gone.
    const { data: show } = await testDb
      .from('shows')
      .select('id')
      .eq('id', fixture.showId)
      .maybeSingle()
    expect(show).toBeNull()

    // The two items carrying its show_id cascaded with it; the two without it
    // remain. This is the same distinction the preview counts, now proved on the
    // delete itself.
    const { data: survivors, error: survivorsError } = await testDb
      .from('day_items')
      .select('id, show_id')
      .eq('tour_date_id', fixture.tourDateId)
    if (survivorsError) throw new Error(`could not read day_items: ${survivorsError.message}`)
    expect(survivors).toHaveLength(2)
    expect(survivors?.every((i) => i.show_id === null)).toBe(true)

    // The day was labelled 'show' by the fixture. With no show behind it, it
    // reverts. Transport is still linked, so it becomes a travel day.
    const { data: tourDate } = await testDb
      .from('tour_dates')
      .select('day_type')
      .eq('id', fixture.tourDateId)
      .single()
    expect(tourDate?.day_type).not.toBe('show')
    expect(tourDate?.day_type).toBe('travel')

    // The roster is untouched: deleting a show tells nobody by deleting nobody.
    const { count: peopleCount } = await testDb
      .from('people')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', fixture.tourId)
    expect(peopleCount).toBe(3)
  })
})
