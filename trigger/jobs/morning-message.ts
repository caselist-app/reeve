import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMorningMessageData } from '@/lib/comms/templates/morning-message'
import { notify, type ChannelOutcome } from '@/lib/comms/notify'

// Returns today's date as YYYY-MM-DD in the given IANA timezone.
// en-CA locale produces ISO date format natively.
function localDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

// Runs fn over items with a maximum of `concurrency` parallel executions.
// Uses Promise.allSettled so one failure does not abort the batch.
async function runConcurrently<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  concurrency: number
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.allSettled(items.slice(i, i + concurrency).map(fn))
  }
}

// Fires daily at 07:00 UTC for each active tour.
// One Trigger.dev schedule is registered per tour on creation (externalId: morning-{tourId}).
// The job resolves today in the tour's local timezone before checking for a show,
// so a show day is never missed due to UTC/local divergence.
export const morningMessageSchedule = schedules.task({
  id: 'morning-message',
  run: async (payload) => {
    // Tour ID is encoded in externalId at schedule creation time.
    const tourId = payload.externalId?.replace(/^morning-/, '')
    if (!tourId) {
      console.error('[morning-message] Missing externalId on schedule payload')
      return { skipped: true, reason: 'no_tour_id' }
    }

    const admin = createAdminClient()

    const { data: tour } = await admin
      .from('tours')
      .select('id, timezone')
      .eq('id', tourId)
      .single()

    if (!tour) return { skipped: true, reason: 'tour_not_found' }

    const timezone = tour.timezone ?? 'UTC'
    const today = localDate(timezone)

    // Check for a show on today's date in the tour's timezone.
    const { data: show } = await admin
      .from('shows')
      .select('id, venue_name, date')
      .eq('tour_id', tourId)
      .eq('date', today)
      .maybeSingle()

    if (!show) return { skipped: true, reason: 'no_show_today', date: today }

    // Everyone on the tour with at least one usable address (WhatsApp or email).
    // The notifications service resolves the actual channel per person from
    // their contact preference; the job just hands it the recipients.
    const { data: peopleRows } = await admin
      .from('people')
      .select('id, contacts(whatsapp_number, contact_email)')
      .eq('tour_id', tourId)

    const people = (peopleRows ?? []).filter((r) => {
      const c = r.contacts as { whatsapp_number: string | null; contact_email: string | null } | null
      return !!(c?.whatsapp_number || c?.contact_email)
    })

    if (people.length === 0) {
      return { skipped: true, reason: 'no_contactable_people' }
    }

    const results: { person_id: string; channels: ChannelOutcome[] }[] = []

    await runConcurrently(
      people,
      async (person) => {
        const data = await buildMorningMessageData(person.id, show.id, timezone)
        if (!data) {
          results.push({ person_id: person.id, channels: [] })
          return
        }

        // notify() owns channel selection and idempotency. dedupDimension is the
        // show date, so a person gets one morning message per show day per channel.
        const result = await notify({
          tourId,
          personId: person.id,
          type: 'morning_message',
          data,
          dedupDimension: today,
        })

        results.push({ person_id: person.id, channels: result.channels })
      },
      5
    )

    return { show_date: today, people_count: people.length, results }
  },
})
