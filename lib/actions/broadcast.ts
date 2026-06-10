'use server'

import { randomUUID } from 'crypto'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { getAffectedPeople } from '@/lib/comms/affected'
import {
  buildShowLoadInChangeMessage,
  buildShowAddressChangeMessage,
  buildDaySheetChangeMessage,
  buildTransportChangeMessage,
  buildHotelChangeMessage,
} from '@/lib/comms/templates/change-alert'
import { broadcastJob } from '@/trigger/jobs/broadcast'
import type { ChangeDescriptor, AffectedPerson } from '@/lib/comms/affected'

export type BroadcastPreview = {
  people: Pick<AffectedPerson, 'id' | 'name'>[]
  message: string
}

export type BroadcastResult = {
  error: string | null
  sent?: number
}

// Called by NotifyPanel before the TM confirms.
// Returns the affected people and the auto-generated message so the TM can
// review (and optionally edit) before sending.
// previousValue is the human-readable old value to include in the "was X" part.
export async function previewBroadcast(
  tourId: string,
  change: ChangeDescriptor,
  previousValue?: string | null
): Promise<BroadcastPreview> {
  await requireUser()

  const supabase = await createClient()
  const people = await getAffectedPeople(change, tourId, supabase)

  const message = await buildPreviewMessage(supabase, change, previousValue)

  return {
    people: people.map((p) => ({ id: p.id, name: p.name })),
    message,
  }
}

// Called when the TM clicks Send in the NotifyPanel.
// Generates a unique change_id for idempotency, claims the sends, and enqueues
// the broadcast job. Returns the count immediately - sends are async.
export async function sendBroadcast(params: {
  tourId: string
  change: ChangeDescriptor
  previousValue?: string | null
  customMessage?: string | null
}): Promise<BroadcastResult> {
  await requireUser()

  const { tourId, change, previousValue, customMessage } = params
  const supabase = await createClient()

  const people = await getAffectedPeople(change, tourId, supabase)
  if (people.length === 0) {
    return { error: null, sent: 0 }
  }

  const message = await buildPreviewMessage(supabase, change, previousValue, customMessage)

  // A new UUID per send event is the idempotency anchor.
  // If the TM clicks Send twice, the second call generates a new change_id
  // so it would send again - intentional, since the TM clicked Send again.
  // The Redis check inside the job prevents double-send within a single enqueue.
  const changeId = randomUUID()

  await broadcastJob.trigger({
    tour_id: tourId,
    change_id: changeId,
    change_type: change.type,
    message,
    affected_person_ids: people.map((p) => p.id),
  })

  return { error: null, sent: people.length }
}

// Builds the auto-generated change message by fetching the current record values.
// customMessage, when present, is appended below the auto-generated line.
async function buildPreviewMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  change: ChangeDescriptor,
  previousValue?: string | null,
  customMessage?: string | null
): Promise<string> {
  switch (change.type) {
    case 'transport_segment': {
      const { data: seg } = await supabase
        .from('transport_segments')
        .select('carrier_operator, vehicle_or_flight_no, depart_at, mode')
        .eq('id', change.segmentId)
        .single()

      const date = seg?.depart_at ? seg.depart_at.slice(0, 10) : 'TBC'
      const newTime = seg?.depart_at
        ? new Date(seg.depart_at).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
          })
        : 'TBC'

      return buildTransportChangeMessage({
        carrier: seg?.carrier_operator ?? null,
        flightOrVehicleNo: seg?.vehicle_or_flight_no ?? null,
        date,
        newDepartTime: newTime,
        previousDepartTime: previousValue ?? null,
        customMessage,
      })
    }

    case 'hotel_stay': {
      const { data: stay } = await supabase
        .from('hotel_stays')
        .select('name, check_in_date, check_in_time')
        .eq('id', change.stayId)
        .single()

      const date = stay?.check_in_date ?? 'TBC'
      const newTime = stay?.check_in_time ?? 'TBC'

      return buildHotelChangeMessage({
        hotelName: stay?.name ?? null,
        date,
        newCheckInTime: newTime,
        previousCheckInTime: previousValue ?? null,
        customMessage,
      })
    }

    case 'show': {
      const { data: show } = await supabase
        .from('shows')
        .select('venue_name, date, load_in_at, address')
        .eq('id', change.showId)
        .single()

      const venueName = show?.venue_name ?? 'venue'
      const date = show?.date ?? 'TBC'

      if (change.field === 'address') {
        return buildShowAddressChangeMessage({
          venueName,
          newAddress: show?.address ?? 'TBC',
          customMessage,
        })
      }

      // load_in_at or curfew_at change: show the new time with "was" context.
      const fieldValue = change.field === 'load_in_at' ? show?.load_in_at : null
      const newTime = fieldValue
        ? new Date(fieldValue).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
          })
        : 'TBC'

      return buildShowLoadInChangeMessage({
        venueName,
        date,
        newLoadIn: newTime,
        previousLoadIn: previousValue ?? null,
        customMessage,
      })
    }

    case 'day_sheet': {
      const { data: show } = await supabase
        .from('shows')
        .select('venue_name, date, day_sheets(load_in)')
        .eq('id', change.showId)
        .single()

      const venueName = show?.venue_name ?? 'venue'
      const date = show?.date ?? 'TBC'

      // day_sheets is a one-to-one join - supabase returns it as an object, not array
      const ds = show?.day_sheets as { load_in: string | null } | null
      const newLoadIn = ds?.load_in
        ? new Date(ds.load_in).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
          })
        : null

      return buildDaySheetChangeMessage({
        venueName,
        date,
        newLoadIn,
        previousLoadIn: previousValue ?? null,
        customMessage,
      })
    }
  }
}
