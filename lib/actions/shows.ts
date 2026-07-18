'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { showSchema } from '@/lib/validators/show'
import { bustTourContextCache } from '@/lib/ai/context'
import { daySheetFormSchema } from '@/lib/validators/day-sheet'
import { setAdvanceStatus } from '@/lib/shows/advance'
import { resolveHubJob } from '@/trigger/jobs/resolve-hub'
import { revertDayTypeIfOrphaned } from '@/lib/schedule/day-type-revert'
import type { z } from 'zod'
import type { TablesUpdate } from '@/lib/types/database'
import type { Department, AdvanceStatus } from '@/lib/shows/advance'

export type ShowActionState = { error: string | null; showId?: string }

// Converts a HH:MM time string plus a date and IANA timezone into a UTC ISO string.
// All three inserts happen in the IANA timezone; day-sheet times are stored as
// proper timestamptz so they survive DST changes and cross-timezone comparisons.
// Falls back to treating the time as UTC if no timezone is provided.
function localTimeToUtcIso(date: string, time: string, tz: string): string {
  // Treat the date+time as UTC first to create a reference point.
  const ref = new Date(`${date}T${time}:00.000Z`)
  // Find how the target timezone reads at that UTC instant (sv-SE gives "YYYY-MM-DD HH:MM:SS").
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz })
  const [localDate, localTime] = localStr.split(' ')
  // Reconstruct a UTC date from that local representation.
  const localAsUtc = new Date(`${localDate}T${localTime}.000Z`)
  // The offset is the gap between what we put in and what the tz displays.
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}

export async function createShow(
  tourId: string,
  data: z.infer<typeof showSchema>
): Promise<ShowActionState> {
  const user = await requireUser()

  const parsed = showSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // Explicit ownership check before hitting the RPC. The RPC also checks via
  // owns_tour(), but this surfaces a clear error message rather than a DB exception.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) {
    return { error: 'Tour not found.' }
  }

  const { data: showId, error } = await supabase.rpc('create_show_with_dependents', {
    p_tour_id: tourId,
    p_show_data: parsed.data,
  })

  if (error) {
    return { error: error.message }
  }

  // Enqueue hub resolution asynchronously. The show is saved and returned
  // immediately. The job writes transport_hub_iata, transport_hub_rail,
  // hub_ground_minutes, and hub_resolved_at once it completes.
  await resolveHubJob.trigger({ show_id: showId })

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/shows`)

  return { error: null, showId }
}

export async function updateShow(
  showId: string,
  data: z.infer<typeof showSchema>
): Promise<ShowActionState> {
  await requireUser()

  const parsed = showSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // RLS on shows enforces owns_tour(tour_id). Returns null if caller does not own.
  const { data: existing } = await supabase
    .from('shows')
    .select('address')
    .eq('id', showId)
    .single()

  if (!existing) {
    return { error: 'Show not found.' }
  }

  const addressChanged = (parsed.data.address ?? null) !== (existing.address ?? null)

  const { error } = await supabase
    .from('shows')
    .update({
      ...parsed.data,
      // Clear the hub cache whenever the address changes so the planner UI
      // shows "Resolving..." until the job completes.
      ...(addressChanged
        ? {
            hub_resolved_at: null,
            transport_hub_iata: null,
            transport_hub_rail: null,
            hub_ground_minutes: null,
          }
        : {}),
    })
    .eq('id', showId)

  if (error) {
    return { error: error.message }
  }

  if (addressChanged) {
    await resolveHubJob.trigger({ show_id: showId })
  }

  // Fetch tour_id for cache bust (not in the existing select above).
  const { data: showRow } = await supabase
    .from('shows')
    .select('tour_id')
    .eq('id', showId)
    .single()

  if (showRow) {
    void bustTourContextCache(showRow.tour_id)
    revalidatePath(`/tours/${showRow.tour_id}/shows`)
  }

  return { error: null, showId }
}

export async function deleteShow(showId: string): Promise<ShowActionState> {
  await requireUser()

  const supabase = await createClient()

  // RLS check: returns null if caller does not own the show's tour.
  const { data: show } = await supabase
    .from('shows')
    .select('id, tour_id, tour_date_id')
    .eq('id', showId)
    .single()

  if (!show) {
    return { error: 'Show not found.' }
  }

  // show_advance and day_sheets cascade-delete from show_id.
  const { error } = await supabase.from('shows').delete().eq('id', showId)

  if (error) {
    return { error: error.message }
  }

  // The show's tour_date was upserted to day_type = 'show' when it was
  // created (create_show_with_dependents RPC). Without this, the day would
  // stay stuck labelled "Show day" with no show behind it.
  if (show.tour_date_id) {
    await revertDayTypeIfOrphaned(supabase, show.tour_date_id, 'show')
  }

  void bustTourContextCache(show.tour_id)
  revalidatePath(`/tours/${show.tour_id}/schedule`)

  return { error: null }
}

export async function updateDaySheet(
  showId: string,
  data: z.infer<typeof daySheetFormSchema>
): Promise<ShowActionState> {
  await requireUser()

  const parsed = daySheetFormSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // Fetch show date and tour timezone in two queries to avoid join typing issues.
  const { data: show } = await supabase
    .from('shows')
    .select('date, tour_id')
    .eq('id', showId)
    .single()

  if (!show) {
    return { error: 'Show not found.' }
  }

  const { data: tourRow } = await supabase
    .from('tours')
    .select('timezone')
    .eq('id', show.tour_id)
    .single()

  const timezone = tourRow?.timezone ?? null

  const TIME_FIELDS = [
    'venue_access',
    'load_in',
    'line_check',
    'soundcheck',
    'vip',
    'doors',
    'support_on',
    'support_off',
    'changeover',
    'headliner_on',
    'headliner_off',
    'curfew',
    'load_out',
    'hotel_departure',
  ] as const

  const converted: Record<string, string | null> = {}

  for (const field of TIME_FIELDS) {
    const val = parsed.data[field]
    if (!val) {
      converted[field] = null
    } else if (timezone) {
      converted[field] = localTimeToUtcIso(show.date, val, timezone)
    } else {
      // No tour timezone set: treat as UTC to avoid silent data loss.
      converted[field] = `${show.date}T${val}:00.000Z`
    }
  }

  // Cast required: the Supabase client rejects index-signature types.
  // All keys in converted are valid day_sheets columns.
  const { error } = await supabase
    .from('day_sheets')
    .update(converted as TablesUpdate<'day_sheets'>)
    .eq('show_id', showId)

  if (error) {
    return { error: error.message }
  }

  void bustTourContextCache(show.tour_id)

  return { error: null }
}

export async function updateShowNotes(
  showId: string,
  notes: string,
): Promise<ShowActionState> {
  await requireUser()

  const supabase = await createClient()

  const { data: show } = await supabase
    .from('shows')
    .select('tour_id')
    .eq('id', showId)
    .single()

  if (!show) return { error: 'Show not found.' }

  const { error } = await supabase
    .from('shows')
    .update({ notes })
    .eq('id', showId)

  if (error) return { error: error.message }

  void bustTourContextCache(show.tour_id)
  revalidatePath(`/tours/${show.tour_id}/schedule`)
  return { error: null, showId }
}

export async function updateAdvanceStatus(
  showId: string,
  department: Department,
  status: AdvanceStatus
): Promise<ShowActionState> {
  await requireUser()
  const supabase = await createClient()
  const err = await setAdvanceStatus(showId, department, status, supabase)
  if (err) return { error: err }
  return { error: null }
}
