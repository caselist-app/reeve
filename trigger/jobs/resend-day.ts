import { task, wait } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDayMessage } from '@/lib/comms/send-day-message'

export type ResendDayPayload = {
  tour_id: string
  // YYYY-MM-DD, the tour-local date to resend for.
  date: string
  // Minted fresh per call by lib/actions/day-message.ts's resendDay. Folded
  // into the dedup dimension below so a resend is never skipped as a retry
  // of the 07:00 send (dedup_dimension = date) or of an earlier resend.
  send_id: string
}

// Manual counterpart to trigger/jobs/morning-message.ts's 07:00 schedule.
// Deliberately does not check tours.morning_message_enabled: that flag gates
// the automatic send, and nothing else. A TM pressing the resend button is TM
// action, not the thing the flag exists to gate (REE-104).
export const resendDayJob = task({
  id: 'resend-day',
  run: async (payload: ResendDayPayload) => {
    const admin = createAdminClient()

    const { data: tour } = await admin
      .from('tours')
      .select('timezone, artists(name)')
      .eq('id', payload.tour_id)
      .maybeSingle()

    if (!tour) return { skipped: true, reason: 'tour_not_found' }

    const timezone = tour.timezone ?? 'UTC'
    const artistName = (tour.artists as { name: string } | null)?.name ?? ''

    return sendDayMessage({
      tourId: payload.tour_id,
      date: payload.date,
      timezone,
      artistName,
      dedupDimension: `${payload.date}:${payload.send_id}`,
      stagger: async (seconds) => {
        await wait.for({ seconds })
      },
    })
  },
})
