import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './setup'
import { createFixture, destroyFixture, createSecondTour, type Fixture } from './fixture'
import { getShowAdvance } from '@/lib/actions/shows'

// Brief 36 step 6 moved the advance off the show page and into a panel, and
// moving it turned up a bug that had been live since the feature was written.
//
// The page filtered the recipient list with `.not('contact_email', 'is', null)`
// against `people`, which has no such column: the email is on `contacts`.
// PostgREST rejected the query, the destructure took `data` as null, `?? []`
// turned that into an empty list, and "Send to venue" rendered a picker with
// nobody in it. No error surfaced anywhere. A TM could open the advance, pick a
// rider, and find there was no one to send it to, on a tour full of crew.
//
// The fix is the rule already in CLAUDE.md: a filter on an embedded table needs
// !inner, and it goes on the embedded column. This file is here because that is
// invisible to tsc (it is a PostgREST string) and invisible in review (it looks
// like a filter, and it is a filter, just on the wrong table).

const DATE = '2030-06-14'

describe('the advance panel gets real data', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function giveCrewAnEmail(email = 'crew@example.test') {
    const { error } = await testDb
      .from('contacts')
      .update({ contact_email: email })
      .eq('id', fixture.contactId)
    if (error) throw new Error(`could not set the contact email: ${error.message}`)
  }

  async function addRider(docType: string, title: string) {
    const { data, error } = await testDb
      .from('documents')
      .insert({
        tour_id: fixture.tourId,
        doc_type: docType,
        title,
        storage_path: `${fixture.tourId}/${title}.pdf`,
      })
      .select('id')
      .single()
    // Thrown rather than asserted: a test that continues past a failed setup
    // passes or fails for a reason that has nothing to do with what it checks.
    if (error || !data) throw new Error(`could not add the rider: ${error?.message}`)
    return data.id
  }

  describe('the recipient list', () => {
    it('includes a crew member who has an email address', async () => {
      // The regression. This returned an empty array for the entire life of the
      // show page.
      await giveCrewAnEmail()

      const { data, error } = await getShowAdvance(fixture.tourId, fixture.showId)
      if (error) throw new Error(`could not load the advance: ${error}`)

      expect(data?.people).toHaveLength(1)
      expect(data?.people[0]).toMatchObject({
        id: fixture.personId,
        name: 'Test Crew',
        contact_email: 'crew@example.test',
      })
    })

    it('excludes a crew member with no email address', async () => {
      // The inverse case, and the reason the filter exists at all. Without it a
      // person with no email reaches the picker and the send fails later, at
      // the point where a TM believes a rider has gone out.
      const { data, error } = await getShowAdvance(fixture.tourId, fixture.showId)
      if (error) throw new Error(`could not load the advance: ${error}`)

      expect(data?.people).toEqual([])
    })
  })

  describe('the documents', () => {
    it('files each rider under the department that sends it', async () => {
      const techRiderId = await addRider('tech_rider', 'Tech Rider v3')
      await addRider('hospitality_rider', 'Hospitality Rider')

      const { data, error } = await getShowAdvance(fixture.tourId, fixture.showId)
      if (error) throw new Error(`could not load the advance: ${error}`)

      const audio = data?.departments.find((d) => d.department === 'audio')
      expect(audio?.documents.map((doc) => doc.id)).toEqual([techRiderId])

      // Every documented department is present whether or not it has a rider,
      // so the panel can show a TM which ones have nothing to send.
      expect(data?.departments.map((d) => d.department).sort()).toEqual([
        'audio',
        'hospitality',
        'lighting',
        'staging',
      ])

      const lighting = data?.departments.find((d) => d.department === 'lighting')
      expect(lighting?.documents).toEqual([])
    })

    it('leaves out a document that is not a rider', async () => {
      // The action stopped filtering doc_type in the query, because the
      // department mapping already does it. This is what makes that safe.
      await addRider('settlement', 'Settlement')

      const { data, error } = await getShowAdvance(fixture.tourId, fixture.showId)
      if (error) throw new Error(`could not load the advance: ${error}`)

      const everyDocument = (data?.departments ?? []).flatMap((d) => d.documents)
      expect(everyDocument).toEqual([])
    })
  })

  describe('tour scoping', () => {
    it('refuses a show that belongs to another tour', async () => {
      // RLS scopes rows by tour but does not check that two ids in one payload
      // belong together, and one TM owns both tours here, so RLS passes on
      // both reads. Without the explicit check this would return tour A's
      // documents against tour B's show.
      const other = await createSecondTour(fixture)

      const { data, error } = await getShowAdvance(fixture.tourId, other.showId)

      expect(data).toBeNull()
      expect(error).toBe('Show not found on this tour.')
    })
  })
})
