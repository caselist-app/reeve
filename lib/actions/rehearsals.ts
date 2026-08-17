'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { definedOnly } from '@/lib/forms/write-row'
import { revertDayTypeIfOrphaned } from '@/lib/schedule/day-type-revert'
import { resolveRehearsalTimezoneJob } from '@/trigger/jobs/resolve-rehearsal-timezone'
import { z } from 'zod'

const rehearsalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  location_name: z.string().min(1, 'Location name is required'),
  address: z.string().nullable().optional(),
  google_maps_url: z.string().url('Invalid URL').nullable().optional(),
  start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type RehearsalActionState = {
  error: string | null
  rehearsalId?: string
}

// Creates the tour_dates row (upsert) and the rehearsals row together.
// Returns the rehearsalId so the caller can redirect to the detail page.
export async function createRehearsal(
  tourId: string,
  data: z.infer<typeof rehearsalSchema>
): Promise<RehearsalActionState> {
  const user = await requireUser()

  const parsed = rehearsalSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.' }

  // Upsert the tour_dates row. If a date already exists, update day_type to rehearsal.
  const { data: tourDate, error: tdError } = await supabase
    .from('tour_dates')
    .upsert(
      { tour_id: tourId, date: parsed.data.date, day_type: 'rehearsal' },
      { onConflict: 'tour_id,date', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (tdError) return { error: tdError.message }

  const { date: _date, ...rest } = parsed.data

  const { data: rehearsal, error: rError } = await supabase
    .from('rehearsals')
    .insert({
      tour_id: tourId,
      tour_date_id: tourDate.id,
      location_name: rest.location_name,
      address: rest.address ?? null,
      google_maps_url: rest.google_maps_url ?? null,
      start_at: rest.start_at ?? null,
      end_at: rest.end_at ?? null,
      notes: rest.notes ?? null,
    })
    .select('id')
    .single()

  if (rError) return { error: rError.message }

  // Triggered unconditionally, same as a show's resolve-hub fallback path: the
  // job itself is a no-op when there is no address, so the caller does not have
  // to duplicate that check.
  await resolveRehearsalTimezoneJob.trigger({ rehearsal_id: rehearsal.id })

  // This upserts a tour_dates row, which is the Dates sidebar. That sidebar is
  // a Next.js layout inside the @secondaryPanel slot, and a soft navigation
  // does not re-resolve a layout. The caller pushes (add-day-panel.tsx sends
  // the TM to the new day), so without this a rehearsal created on a date the
  // tour did not have yet added a day that did not appear in the sidebar until
  // a hard reload.
  //
  // router.refresh() would re-resolve it, but the caller does not call it and
  // this action must not depend on which one the caller chose. Deleting this
  // line turns the Dates spec in tests/e2e/revalidate.spec.ts red, which is
  // where that claim was checked rather than assumed (Brief 41).
  revalidatePath(`/tours/${tourId}/schedule`)

  return { error: null, rehearsalId: rehearsal.id }
}

export async function updateRehearsal(
  rehearsalId: string,
  data: Partial<Omit<z.infer<typeof rehearsalSchema>, 'date'>>
): Promise<RehearsalActionState> {
  await requireUser()

  const supabase = await createClient()

  // RLS on rehearsals enforces owns_tour(tour_id), so this is null when the
  // caller does not own it. Read for the revalidate path, for the address-change
  // check below, and as the ownership gate that gives a clean message instead
  // of a silent no-op update.
  const { data: existing } = await supabase
    .from('rehearsals')
    .select('tour_id, address')
    .eq('id', rehearsalId)
    .single()

  if (!existing) return { error: 'Rehearsal not found.' }

  // undefined means the form never sent address, so nothing about it changed.
  const addressChanged = data.address !== undefined && data.address !== existing.address

  // The parameter is a Partial, and every field was being written as
  // `data.field ?? null`, so any caller submitting a subset would have cleared
  // the rest. Its one caller happens to send everything, which is the only
  // reason this had not destroyed anything yet. definedOnly makes that a
  // property of the action rather than a property of today's caller.
  //
  // A stale coordinate pair beats no coordinate pair: if the address changed,
  // the old venue_lat/venue_lng/timezone belong to the old address, so they are
  // cleared in this same write rather than left to read as though they still
  // describe the new one until the async job comes back.
  const { error } = await supabase
    .from('rehearsals')
    .update(
      definedOnly({
        location_name: data.location_name,
        address: data.address,
        google_maps_url: data.google_maps_url,
        start_at: data.start_at,
        end_at: data.end_at,
        notes: data.notes,
        ...(addressChanged ? { venue_lat: null, venue_lng: null, timezone: null } : {}),
      }),
    )
    .eq('id', rehearsalId)

  if (error) return { error: error.message }

  // The worst of the missing revalidates, because its caller is an edit panel
  // that sets `saved` and never refreshes. Without this the panel said "Saved."
  // over a timeline still rendering the old location and times.
  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  // Same unconditional trigger as create: the job no-ops when the new address
  // is null, so this does not need to duplicate that check.
  if (addressChanged) {
    await resolveRehearsalTimezoneJob.trigger({ rehearsal_id: rehearsalId })
  }

  return { error: null, rehearsalId }
}

export async function deleteRehearsal(rehearsalId: string): Promise<RehearsalActionState> {
  await requireUser()

  const supabase = await createClient()

  // RLS check: returns null if caller does not own the rehearsal's tour.
  const { data: rehearsal } = await supabase
    .from('rehearsals')
    .select('id, tour_id, tour_date_id')
    .eq('id', rehearsalId)
    .single()

  if (!rehearsal) return { error: 'Rehearsal not found.' }

  const { error } = await supabase
    .from('rehearsals')
    .delete()
    .eq('id', rehearsalId)

  if (error) return { error: error.message }

  // The rehearsal's tour_date was upserted to day_type = 'rehearsal' when it
  // was created. Without this, the day would stay stuck labelled "Rehearsal"
  // with nothing behind it.
  if (rehearsal.tour_date_id) {
    await revertDayTypeIfOrphaned(supabase, rehearsal.tour_date_id, 'rehearsal')
  }

  revalidatePath(`/tours/${rehearsal.tour_id}/schedule`)

  return { error: null }
}
