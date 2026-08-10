'use server'

import { redirect } from 'next/navigation'
import { schedules } from '@trigger.dev/sdk/v3'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { tourSchema, tourSettingsSchema } from '@/lib/validators/tour'

export type TourActionState = { error: string | null }

// TODO: Brief 02 - replace with the actual trial gate check once billing is wired.
async function canCreateTour(_accountId: string): Promise<boolean> {
  return true
}

function parseTourFormData(formData: FormData) {
  return tourSchema.safeParse({
    name: formData.get('name'),
    artist_id: formData.get('artist_id'),
    start_date: formData.get('start_date') || undefined,
    end_date: formData.get('end_date') || undefined,
    territory: formData.get('territory') || undefined,
    base_currency: formData.get('base_currency') || 'GBP',
    timezone: formData.get('timezone') || undefined,
    // Checkboxes are absent from FormData when unchecked; treat absence as false.
    inbound_qa_enabled: formData.get('inbound_qa_enabled') === 'true',
    morning_message_enabled: formData.get('morning_message_enabled') === 'true',
  })
}

// The settings form edits a subset of the tour and does not manage the artist,
// so it validates against tourSettingsSchema. Parsing it with the create schema
// meant artist_id came back null and every save failed. Do not "simplify" this
// back into parseTourFormData: the two forms send different field sets.
function parseTourSettingsFormData(formData: FormData) {
  return tourSettingsSchema.safeParse({
    name: formData.get('name'),
    start_date: formData.get('start_date') || undefined,
    end_date: formData.get('end_date') || undefined,
    territory: formData.get('territory') || undefined,
    base_currency: formData.get('base_currency') || 'GBP',
    timezone: formData.get('timezone') || undefined,
    // Toggles post as hidden inputs carrying 'true' or 'false'.
    inbound_qa_enabled: formData.get('inbound_qa_enabled') === 'true',
    morning_message_enabled: formData.get('morning_message_enabled') === 'true',
  })
}

export async function createTourAction(
  _prev: TourActionState,
  formData: FormData
): Promise<TourActionState> {
  const user = await requireUser()

  const parsed = parseTourFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const allowed = await canCreateTour(user.id)
  if (!allowed) {
    return { error: 'You have reached the tour limit on your current plan.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tours')
    .insert({ account_id: user.id, ...parsed.data })
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  // morning_message_enabled defaults to false at creation; the schedule is
  // registered when the TM first enables the toggle in tour settings.

  redirect(`/tours/${data!.id}/people`)
}

// Called from the settings form through useEntityForm, which invokes it inside a
// transition and calls router.refresh() on success. It is not a useActionState
// form action, so it takes no previous-state argument.
export async function updateTourAction(
  tourId: string,
  formData: FormData
): Promise<TourActionState> {
  const user = await requireUser()

  const parsed = parseTourSettingsFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('tours')
    .update(parsed.data)
    .eq('id', tourId)
    .eq('account_id', user.id)
    .select('id, timezone, morning_message_enabled')
    .single()

  if (error || !updated) {
    return { error: error?.message ?? 'Update failed.' }
  }

  // Manage the morning-message schedule in sync with the toggle.
  // schedules.create is idempotent via deduplicationKey; deactivate is safe to
  // call even if the schedule does not exist yet.
  const externalId = `morning-${tourId}`
  if (updated.morning_message_enabled) {
    try {
      // Fire at 07:00 in the tour's local timezone. Trigger.dev honours the
      // timezone field so no UTC offset arithmetic is needed here.
      await schedules.create({
        task: 'morning-message',
        cron: '0 7 * * *',
        timezone: updated.timezone ?? 'UTC',
        externalId,
        deduplicationKey: externalId,
      })
    } catch (scheduleErr) {
      console.error('[updateTour] Failed to register morning-message schedule:', scheduleErr)
    }
  } else {
    try {
      await schedules.deactivate(externalId)
    } catch {
      // Schedule may not exist yet (e.g. never enabled). Silently ignore.
    }
  }

  // No revalidatePath here, and no client refresh either. Both are deliberate,
  // and this is the one action in the repo where adding either is a regression.
  //
  // The tour name renders in components/nav/tour-selector.tsx and sidebar.tsx,
  // which sit in the app layout above this route. Repainting them from down here
  // is what broke: revalidatePath(..., 'layout') and router.refresh() both had
  // the client receive a correct payload and never commit it, leaving the save
  // stuck on "Saving..." with the old name until a reload, about one save in
  // five (REE-65). The server was right in every failing run, which is why it
  // took three sessions to find.
  //
  // So the visible rename does not travel through the server at all. The form
  // writes the new name to stores/tour-name-store.ts on success and the nav
  // reads it. components/tours/settings-form.tsx therefore does NOT pass
  // refreshOnSuccess to useEntityForm, and must not: that is the round-trip this
  // removed. Server data catches up on the next navigation, since everything
  // under app/(app) is a dynamic render.
  //
  // Verified over 20 consecutive runs of tests/e2e/revalidate.spec.ts:104.
  return { error: null }
}

// Called directly from a client component onClick (not via useActionState).
// Redirects to /app on success; returns an error string on failure.
export async function archiveTourAction(tourId: string): Promise<TourActionState> {
  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('tours')
    .update({ status: 'archived' })
    .eq('id', tourId)
    .eq('account_id', user.id)

  if (error) {
    return { error: error.message }
  }

  // Deactivate the daily morning-message schedule so archived tours
  // do not continue sending messages to crew.
  try {
    await schedules.deactivate(`morning-${tourId}`)
  } catch (scheduleErr) {
    console.error('[archiveTour] Failed to deactivate morning-message schedule:', scheduleErr)
  }

  redirect('/')
}
