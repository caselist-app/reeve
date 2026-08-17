import { schedules, wait } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { localDateInZone } from '@/lib/schedule/datetime'
import { sendDayMessage } from '@/lib/comms/send-day-message'

// Fires daily at 07:00 UTC for each active tour.
// One Trigger.dev schedule is registered per tour on creation (externalId: morning-{tourId}).
// The job resolves today in the tour's local timezone before checking for a show,
// so a show day is never missed due to UTC/local divergence.
//
// The send itself lives in lib/comms/send-day-message.ts (REE-102), so a
// manual resend button can call the same path. This job stays responsible for
// the schedule payload, the opt-in gate, and today's date.
export const morningMessageSchedule = schedules.task({
  id: 'morning-message',
  run: async (payload) => {
    const tourId = payload.externalId?.replace(/^morning-/, '')
    if (!tourId) {
      console.error('[morning-message] Missing externalId on schedule payload')
      return { skipped: true, reason: 'no_tour_id' }
    }

    const admin = createAdminClient()

    const { data: tour } = await admin
      .from('tours')
      .select('id, timezone, morning_message_enabled, artists(name)')
      .eq('id', tourId)
      .single()

    if (!tour) return { skipped: true, reason: 'tour_not_found' }
    if (!tour.morning_message_enabled) return { skipped: true, reason: 'opt_in_disabled' }

    const timezone = tour.timezone ?? 'UTC'
    const today = localDateInZone(new Date().toISOString(), timezone)
    const artistName = (tour.artists as { name: string } | null)?.name ?? ''

    return sendDayMessage({
      tourId,
      date: today,
      timezone,
      artistName,
      dedupDimension: today,
      stagger: async (seconds) => {
        await wait.for({ seconds })
      },
    })
  },
})
