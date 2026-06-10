import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSendKey, checkAndSet } from '@/lib/comms/idempotency'
import { buildMorningMessageData, renderMorningMessage } from '@/lib/comms/templates/morning-message'
import { sendInteractiveWhatsApp } from '@/lib/comms/whatsapp'
import { sendSms } from '@/lib/comms/sms'

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

    // All people on this tour who have at least one contact number.
    const { data: people } = await admin
      .from('people')
      .select('id, preferred_channel, whatsapp_number, sms_number')
      .eq('tour_id', tourId)
      .or('whatsapp_number.not.is.null,sms_number.not.is.null')

    if (!people || people.length === 0) {
      return { skipped: true, reason: 'no_contactable_people' }
    }

    const results: { person_id: string; outcome: string }[] = []

    await runConcurrently(
      people,
      async (person) => {
        const key = buildSendKey(tourId, person.id, 'morning_message', today)
        const safe = await checkAndSet(key, 60 * 60 * 48) // 48h TTL
        if (!safe) {
          results.push({ person_id: person.id, outcome: 'already_sent' })
          return
        }

        const data = await buildMorningMessageData(person.id, show.id, timezone)
        if (!data) {
          results.push({ person_id: person.id, outcome: 'data_unavailable' })
          return
        }

        const message = renderMorningMessage(data)
        const channel = person.preferred_channel ?? 'whatsapp'

        if (channel === 'sms' && person.sms_number) {
          await sendSms({ to: person.sms_number, body: message })
        } else {
          const to = person.whatsapp_number ?? person.sms_number!
          await sendInteractiveWhatsApp({
            to,
            body: message,
            buttons: [
              { id: 'itinerary', title: '/itinerary' },
              { id: 'travel', title: '/travel' },
              { id: 'hotel', title: '/hotel' },
            ],
          })
        }

        results.push({ person_id: person.id, outcome: 'sent' })
      },
      5
    )

    return { show_date: today, people_count: people.length, results }
  },
})
