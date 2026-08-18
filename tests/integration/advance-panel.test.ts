import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, createSecondTour, type Fixture } from './fixture'
import { getShowAdvance } from '@/lib/actions/shows'
import { nudgeAdvanceFromShareClick } from '@/lib/shows/advance'

// Brief 36 step 6 moved the advance off the show page and into a panel, and
// moving it turned up a bug that had been live since the feature was written:
// the page filtered a roster recipient list with `.not('contact_email', 'is',
// null)` against `people`, which has no such column, so the query silently
// returned nobody to send to. REE-283 later removed that roster-based
// recipient list from getShowAdvance entirely (a send recipient is now a
// freeform email, not a people row), which retired the regression test this
// comment used to describe. What remains below still exercises getShowAdvance
// against real data for the department/document/tour-scoping behaviour that
// REE-283 did not touch.

const DATE = '2030-06-14'

describe('the advance panel gets real data', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

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

  describe('the documents', () => {
    it('files a production_rider under production (REE-294)', async () => {
      // Per REE-292/REE-294, audio and staging merged into a single PRODUCTION
      // department, so the production_rider doc_type (REE-295) files under
      // exactly one department again.
      const productionRiderId = await addRider('production_rider', 'Production Rider v3')
      await addRider('hospitality_rider', 'Hospitality Rider')

      const { data, error } = await getShowAdvance(fixture.tourId, fixture.showId)
      if (error) throw new Error(`could not load the advance: ${error}`)

      const production = data?.departments.find((d) => d.department === 'production')
      expect(production?.documents.map((doc) => doc.id)).toEqual([productionRiderId])

      // Every documented department is present whether or not it has a rider,
      // so the panel can show a TM which ones have nothing to send.
      expect(data?.departments.map((d) => d.department).sort()).toEqual([
        'hospitality',
        'lx',
        'production',
      ])

      const lx = data?.departments.find((d) => d.department === 'lx')
      expect(lx?.documents).toEqual([])
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

    // REE-299. A department can have more than one current rider live at
    // once (a UK leg and a Europe leg), told apart by title, not by a second
    // schema field. This is the assertion that fails red if the query narrows
    // to one row per doc_type instead of returning every current one.
    it('returns every current rider for a department, not just one', async () => {
      const ukRiderId = await addRider('hospitality_rider', 'Hospitality Rider - UK')
      const europeRiderId = await addRider('hospitality_rider', 'Hospitality Rider - Europe')

      const { data, error } = await getShowAdvance(fixture.tourId, fixture.showId)
      if (error) throw new Error(`could not load the advance: ${error}`)

      const hospitality = data?.departments.find((d) => d.department === 'hospitality')
      expect(hospitality?.documents.map((doc) => doc.id).sort()).toEqual(
        [ukRiderId, europeRiderId].sort()
      )
    })

    // REE-299. Archiving is the TM's manual retirement step now that upload
    // never retires automatically, so an archived rider must not still show
    // up as sendable from the advance panel.
    it('leaves out a document that has been archived', async () => {
      const { data: archived, error: archivedError } = await testDb
        .from('documents')
        .insert({
          tour_id: fixture.tourId,
          doc_type: 'hospitality_rider',
          title: 'Old Hospitality Rider',
          storage_path: `${fixture.tourId}/Old Hospitality Rider.pdf`,
          archived_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (archivedError || !archived) throw new Error(`could not seed the archived rider: ${archivedError?.message}`)

      const currentId = await addRider('hospitality_rider', 'Hospitality Rider')

      const { data, error } = await getShowAdvance(fixture.tourId, fixture.showId)
      if (error) throw new Error(`could not load the advance: ${error}`)

      const hospitality = data?.departments.find((d) => d.department === 'hospitality')
      expect(hospitality?.documents.map((doc) => doc.id)).toEqual([currentId])
    })
  })

  describe('acknowledging one show does not advance the others', () => {
    // REE-8. The Resend webhook scoped its show_advance update by tour_id, but
    // show_advance holds one row per show with tour_id denormalised onto it, so
    // acknowledging a single rider marked the department advanced on every show
    // on the tour, including shows that had had no rider sent at all. Seed two
    // shows, acknowledge a production rider against one, and prove the other is
    // untouched. The second assertion is the one that fails red against the
    // tour_id-scoped update.

    async function addSecondShow() {
      const { data: day, error: dayError } = await testDb
        .from('tour_dates')
        .insert({ tour_id: fixture.tourId, date: '2030-06-15', day_type: 'show' })
        .select('id')
        .single()
      if (dayError || !day) throw new Error(`could not add the second day: ${dayError?.message}`)

      const { data: show, error: showError } = await testDb
        .from('shows')
        .insert({
          tour_id: fixture.tourId,
          tour_date_id: day.id,
          date: '2030-06-15',
          venue_name: 'Second Venue',
        })
        .select('id')
        .single()
      if (showError || !show) throw new Error(`could not add the second show: ${showError?.message}`)
      return show.id
    }

    // The fixture inserts shows directly, and nothing creates the show_advance
    // row on that path, so seed it here. Both rows default every department to
    // not_started via the DB defaults.
    async function seedAdvance(showId: string) {
      const { error } = await testDb
        .from('show_advance')
        .insert({ show_id: showId, tour_id: fixture.tourId })
      if (error) throw new Error(`could not seed show_advance for ${showId}: ${error.message}`)
    }

    async function statusProduction(showId: string) {
      const { data, error } = await testDb
        .from('show_advance')
        .select('status_production')
        .eq('show_id', showId)
        .single()
      if (error || !data) throw new Error(`could not read show_advance for ${showId}: ${error?.message}`)
      return data.status_production
    }

    it('advances only the show the rider was sent against', async () => {
      const showBId = await addSecondShow()
      await seedAdvance(fixture.showId)
      await seedAdvance(showBId)

      const riderId = await addRider('production_rider', 'Production Rider')

      const shareToken = `ree8-ack-${Date.now()}`
      const { error: shareError } = await testDb.from('document_shares').insert({
        tour_id: fixture.tourId,
        document_id: riderId,
        recipient_person_id: fixture.personId,
        show_id: fixture.showId,
        channel: 'email',
        share_token: shareToken,
        sent_at: new Date().toISOString(),
      })
      if (shareError) throw new Error(`could not create the share: ${shareError.message}`)

      await nudgeAdvanceFromShareClick(testDb, shareToken)

      // The show the rider went to is nudged.
      expect(await statusProduction(fixture.showId)).toBe('in_progress')
      // Show B never received a rider, so its production advance must be unchanged.
      expect(await statusProduction(showBId)).toBe('not_started')
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
