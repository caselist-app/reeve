'use server'

import { randomUUID } from 'crypto'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { fetchContactablePeople } from '@/lib/comms/send-day-message'
import { resendDayJob } from '@/trigger/jobs/resend-day'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Client = SupabaseClient<Database>

export type DayResendPreview = {
  date: string | null
  venueName: string | null
  recipientCount: number
  // A failed read must never render as an empty result: a broken count that
  // came back as 0 would tell the TM nobody is contactable when the read just
  // failed. previewShowRemoval (lib/actions/shows.ts) is the reference shape.
  error: string | null
}

export type DayResendResult = {
  error: string | null
  sent?: number
}

type ResolvedShowDay =
  | { ok: true; date: string; venueName: string }
  | { ok: false; error: string }

// RLS scopes rows by tour but does not check that a tourDateId in the same
// payload belongs to tourId. lib/actions/day-items.ts's resolveDay is the
// reference shape: a tour_date the caller owns on a different tour would pass
// RLS on both reads, and without this check would resend that tour's show to
// this tour's crew.
async function resolveShowDay(
  supabase: Client,
  tourId: string,
  tourDateId: string
): Promise<ResolvedShowDay> {
  const [{ data: tourDate }, { data: show, error: showError }] = await Promise.all([
    supabase.from('tour_dates').select('date').eq('id', tourDateId).eq('tour_id', tourId).maybeSingle(),
    supabase
      .from('shows')
      .select('venue_name')
      .eq('tour_date_id', tourDateId)
      .eq('tour_id', tourId)
      .maybeSingle(),
  ])

  // maybeSingle() errors rather than returning a row when more than one show
  // matches. Nothing stops two shows sharing a tour_date_id (send-day-message.ts
  // has the same note), and a discarded error here would read as no show and
  // skip silently, the exact bug REE-102 fixed for sendDayMessage's own lookup.
  if (showError) {
    console.error('[day-message] more than one show on this day:', showError, { tourId, tourDateId })
    return { ok: false, error: 'Could not check this day.' }
  }

  if (!tourDate || !show) {
    return { ok: false, error: 'No show on this day.' }
  }

  return { ok: true, date: tourDate.date, venueName: show.venue_name ?? '' }
}

// Called before the TM confirms, from the AlertDialog REE-105 wires up: how
// many crew get it and what day it names, so the dialog can read
// "Send the day to {N} crew?" instead of a blind confirm.
export async function previewDayResend(
  tourId: string,
  tourDateId: string
): Promise<DayResendPreview> {
  await requireUser()

  const supabase = await createClient()

  const day = await resolveShowDay(supabase, tourId, tourDateId)
  if (!day.ok) return { date: null, venueName: null, recipientCount: 0, error: day.error }

  const { people, error: peopleError } = await fetchContactablePeople(supabase, tourId)
  if (peopleError) {
    console.error('[day-message] contactable people read failed:', peopleError, { tourId })
    return {
      date: day.date,
      venueName: day.venueName,
      recipientCount: 0,
      error: 'Could not check who would receive this.',
    }
  }

  return { date: day.date, venueName: day.venueName, recipientCount: people.length, error: null }
}

// Called when the TM confirms. Mints a fresh send_id so the dedup dimension
// (`${date}:${send_id}`, set in trigger/jobs/resend-day.ts) never collides
// with the 07:00 send or an earlier resend, then enqueues and returns fast:
// the send itself happens on Trigger.dev.
export async function resendDay(tourId: string, tourDateId: string): Promise<DayResendResult> {
  await requireUser()

  const supabase = await createClient()

  const day = await resolveShowDay(supabase, tourId, tourDateId)
  if (!day.ok) return { error: day.error }

  const { people, error: peopleError } = await fetchContactablePeople(supabase, tourId)
  if (peopleError) {
    console.error('[day-message] contactable people read failed:', peopleError, { tourId })
    return { error: 'Could not check who would receive this.' }
  }
  if (people.length === 0) return { error: null, sent: 0 }

  const sendId = randomUUID()

  await resendDayJob.trigger({
    tour_id: tourId,
    date: day.date,
    send_id: sendId,
  })

  return { error: null, sent: people.length }
}
