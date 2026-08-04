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

  // RLS proves the caller owns tourId. It does not prove the id inside `change`
  // belongs to that tour, and a TM with two tours would otherwise be able to
  // render tour B's segment into a message and send it to tour A's crew.
  if (!(await changeBelongsToTour(supabase, tourId, change))) {
    return { people: [], message: '' }
  }

  const people = await getAffectedPeople(change, tourId, supabase)

  const message = await buildPreviewMessage(supabase, tourId, change, previousValue)

  return {
    people: people.map((p) => ({ id: p.id, name: p.name })),
    message,
  }
}

// The id carried by a ChangeDescriptor arrives from the client alongside a
// tourId the caller does own, so it has to be checked against that tour before
// it is read or used to pick recipients. Scoping every query by tour_id as well
// (below, and in getAffectedPeople) is the second layer: this one fails loudly,
// that one fails empty.
async function changeBelongsToTour(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tourId: string,
  change: ChangeDescriptor
): Promise<boolean> {
  const [table, id] =
    change.type === 'transport_segment'
      ? (['transport_segments', change.segmentId] as const)
      : change.type === 'hotel_stay'
        ? (['hotel_stays', change.stayId] as const)
        : (['shows', change.showId] as const)

  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('tour_id', tourId)
    .maybeSingle()

  return Boolean(data)
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

  // Same check as previewBroadcast, and this is the one that matters: without
  // it a record from another tour decides both the message and, through the
  // show date, which of this tour's crew receive it.
  if (!(await changeBelongsToTour(supabase, tourId, change))) {
    return { error: 'That record is not on this tour.' }
  }

  const people = await getAffectedPeople(change, tourId, supabase)
  if (people.length === 0) {
    return { error: null, sent: 0 }
  }

  const message = await buildPreviewMessage(supabase, tourId, change, previousValue, customMessage)

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
  tourId: string,
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
        .eq('tour_id', tourId)
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
        .eq('tour_id', tourId)
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
      // Brief 36 step 3: the time comes from the day sheet, which is the only
      // place that holds it now. A plain embed being read, not filtered, so no
      // !inner: a show whose day sheet row is missing should still produce a
      // message with the time TBC rather than no message at all.
      //
      // The tour timezone is read too, because a UTC render told crew a load-in
      // an hour off the one the TM typed on any tour not on UTC. Same bug as
      // /itinerary had, same fix.
      const [{ data: show }, { data: tour }] = await Promise.all([
        supabase
          .from('shows')
          .select('venue_name, date, address, day_sheets(load_in, curfew)')
          .eq('id', change.showId)
          .eq('tour_id', tourId)
          .single(),
        supabase.from('tours').select('timezone').eq('id', tourId).single(),
      ])

      const venueName = show?.venue_name ?? 'venue'
      const date = show?.date ?? 'TBC'

      if (change.field === 'address') {
        return buildShowAddressChangeMessage({
          venueName,
          newAddress: show?.address ?? 'TBC',
          customMessage,
        })
      }

      const daySheet = Array.isArray(show?.day_sheets)
        ? (show.day_sheets[0] ?? null)
        : (show?.day_sheets ?? null)

      // load_in or curfew change: show the new time with "was" context.
      const fieldValue = change.field === 'load_in' ? daySheet?.load_in : daySheet?.curfew
      const newTime = fieldValue
        ? new Date(fieldValue).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: tour?.timezone ?? 'UTC',
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
        .eq('tour_id', tourId)
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
