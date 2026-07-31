import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { notify } from '@/lib/comms/notify'
import type { OpenerData, ShowInfoData, CateringData, WrapData } from '@/lib/comms/templates/day-blocks'
import type { ShowInfoVariant, CateringVariant, WrapVariant, WrapOnwardLeg } from '@/lib/comms/blocks/select'
import type { BoardingPassNotificationData } from '@/lib/comms/templates/boarding-pass'

// Manual test harness for outbound notification types. No UI, no schedule
// dependency: run this task on demand from the Trigger.dev dashboard's Test
// tab (or the CLI) with a JSON payload, and it fires the real notify() path
// straight to whichever channel the target person/contact has configured
// (Telegram is the point of this while WhatsApp templates are still pending
// Meta approval). Sample data is generated here so a test send never depends
// on a real show or day sheet existing.
//
// Safety: this calls notify() exactly like a production job would, so always
// point personId at a dedicated test contact (yourself), never a real crew
// member. dedupDimension is stamped with the current timestamp so repeat runs
// are never treated as duplicates by notification_log's unique claim.

export type TestSendType =
  | 'opener'
  | 'show_information'
  | 'catering'
  | 'wrap'
  | 'boarding_pass'
  | 'change_alert'

export type TestSendPayload = {
  type: TestSendType
  personId: string
  // Variant to test. Defaults to the richest variant for the type if omitted.
  variant?: ShowInfoVariant | CateringVariant | WrapVariant
  // change_alert only: overrides the default sample message.
  message?: string
  // boarding_pass only: pass a real signed Storage URL to test the document
  // send path. Omitted by default, which sends text only.
  documentUrl?: string
}

const SAMPLE_TIMEZONE = 'Europe/London'

// Today at HH:MM local, as a UTC ISO string, for realistic-looking sample times.
function todayAt(hours: number, minutes: number): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes))
  return d.toISOString()
}

export const testSendJob = task({
  id: 'test-send',
  run: async (payload: TestSendPayload) => {
    const admin = createAdminClient()

    // Resolve tour and first name from the person row so the payload only
    // ever needs a personId, never a tourId to keep in sync separately.
    const { data: personRow } = await admin
      .from('people')
      .select('tour_id, contacts(name)')
      .eq('id', payload.personId)
      .single()

    if (!personRow) {
      throw new Error(`No person found for personId ${payload.personId}`)
    }

    const fullName = (personRow.contacts as { name: string } | null)?.name ?? 'Test'
    const firstName = fullName.split(' ')[0]

    const data = buildSampleData(payload, firstName)

    const result = await notify({
      tourId: personRow.tour_id,
      personId: payload.personId,
      type: payload.type,
      data,
      dedupDimension: `test-${Date.now()}`,
    } as Parameters<typeof notify>[0])

    return result
  },
})

function buildSampleData(
  payload: TestSendPayload,
  firstName: string
): OpenerData | ShowInfoData | CateringData | WrapData | BoardingPassNotificationData | { message: string } {
  switch (payload.type) {
    case 'opener': {
      const d: OpenerData = {
        personId: payload.personId,
        person_first_name: firstName,
        artist_name: 'Test Artist',
        venue_name: 'Test Venue',
        show_date: 'Mon 15 Jun',
      }
      return d
    }

    case 'show_information': {
      const variant = (payload.variant as ShowInfoVariant) ?? 'full'
      const d: ShowInfoData = {
        personId: payload.personId,
        variant,
        load_in: todayAt(15, 0),
        soundcheck: todayAt(16, 30),
        changeover: todayAt(19, 0),
        headliner_on: todayAt(20, 30),
        timezone: SAMPLE_TIMEZONE,
      }
      return d
    }

    case 'catering': {
      const variant = (payload.variant as CateringVariant) ?? 'full'
      const d: CateringData = {
        personId: payload.personId,
        variant,
        catering_breakfast_start: todayAt(8, 0),
        catering_breakfast_end: todayAt(9, 30),
        catering_lunch_start: todayAt(12, 0),
        catering_lunch_end: todayAt(13, 30),
        catering_dinner_start: todayAt(18, 0),
        catering_dinner_end: todayAt(19, 30),
        timezone: SAMPLE_TIMEZONE,
      }
      return d
    }

    case 'wrap': {
      const variant = (payload.variant as WrapVariant) ?? 'travel'
      const onwardLeg: WrapOnwardLeg | null =
        variant === 'travel'
          ? { mode: 'bus', destination: 'Next City', depart_at: todayAt(23, 30) }
          : null
      const d: WrapData = {
        personId: payload.personId,
        variant,
        curfew: todayAt(23, 0),
        onwardLeg,
        timezone: SAMPLE_TIMEZONE,
      }
      return d
    }

    case 'boarding_pass': {
      const d: BoardingPassNotificationData = {
        person_first_name: firstName,
        leg_label: 'Flight BA442',
        origin: 'LHR',
        destination: 'CDG',
        depart_formatted: 'Mon 15 Jun, 07:45',
        seat: '14C',
        ticket_reference: 'XZ92KP',
        ground_pickup: '05:15',
        ground_origin: 'Hotel Lobby',
        load_in: '17:00',
        destination_venue: 'Test Venue',
        signedUrl: payload.documentUrl ?? null,
      }
      return d
    }

    case 'change_alert':
      return { message: payload.message ?? 'This is a test change alert. Ignore if received during testing.' }
  }
}
