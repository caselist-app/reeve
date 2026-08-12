'use server'

import { revalidatePath } from 'next/cache'
import { tasks } from '@trigger.dev/sdk/v3'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import {
  createGuestEntrySchema,
  updateGuestEntrySchema,
  guestListAllotmentSchema,
  guestListCutoffSchema,
  guestListLockSchema,
} from '@/lib/validators/guest-list'
import { decideGuestEntry, type OverAllotment } from '@/lib/guest-list/decide'
import { resolveGuestRequestAttention } from '@/lib/guest-list/attention'
import { definedOnly } from '@/lib/forms/write-row'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/types/database'
import type { z } from 'zod'

// Every read and write path for a show's guest list. Brief 52, step 3 (REE-130).
// lib/actions/day-items.ts is the reference for the whole shape: requireUser
// first, RLS client as the ownership gate, an explicit same-tour check for any
// second id in a payload, definedOnly() for the partial-write path, and a
// revalidate on the schedule route for every write.
//
// The approve and decline transitions live in lib/guest-list/decide.ts, because
// the Telegram callback job runs the same core with no user (brief 30's
// runBroadcast split). These actions are the auth-gated panel wrappers.

export type GuestEntryActionState = {
  error: string | null
  entryId?: string
  // Existing names on the same show that share this surname. A duplicate is
  // surfaced, never blocked: two different people really can share a name, so
  // the TM decides. Empty when there is no match.
  duplicates?: DuplicateMatch[]
}

export type DuplicateMatch = { id: string; firstName: string | null; lastName: string | null }

export type ApproveActionState = {
  error: string | null
  alreadyDecided?: boolean
  overAllotment?: OverAllotment | null
}

export type DecideActionState = { error: string | null; alreadyDecided?: boolean }

export type GuestListActionState = { error: string | null }

export type SendConfirmationsState = { error: string | null; count?: number }

export type GuestListView = {
  error: string | null
  entries: Tables<'guest_list_entries'>[]
  allotments: Tables<'guest_list_allotments'>[]
  cutoffAt: string | null
  locked: boolean
  // The tour timezone, so the panel's cutoff field can render a stored UTC
  // instant as tour-local wall clock and write it back the same way (the
  // transport-panel approach). The panel loads its own context, so this rides
  // along here rather than on the descriptor.
  timezone: string
}

type Client = Awaited<ReturnType<typeof createClient>>

// The tour a show belongs to, verified as the caller's. RLS returns the row only
// when the caller owns the tour, so a null here is both "no such show" and "not
// yours". The tour_id it returns is then the scope every write below runs under.
async function resolveShowTour(
  supabase: Client,
  showId: string,
): Promise<Pick<Tables<'shows'>, 'tour_id' | 'guest_list_cutoff_at' | 'guest_list_locked'> | null> {
  const { data } = await supabase
    .from('shows')
    .select('tour_id, guest_list_cutoff_at, guest_list_locked')
    .eq('id', showId)
    .maybeSingle()

  return data ?? null
}

async function showIsOnTour(supabase: Client, showId: string, tourId: string): Promise<boolean> {
  const { data } = await supabase
    .from('shows')
    .select('id')
    .eq('id', showId)
    .eq('tour_id', tourId)
    .maybeSingle()

  return Boolean(data)
}

// Existing active names on the show that share this surname, case-insensitive.
// Exact match for now: the fuzzy version (brief note 7 extracts the Levenshtein
// distance from lib/schedule/parse-day-item.ts and re-tunes it for human names)
// lands with the chat request flow that surfaces the warning to crew, and wants
// its own thresholds. Draft and removed rows do not count as a match.
async function findSurnameMatches(
  supabase: Client,
  showId: string,
  lastName: string | null,
): Promise<DuplicateMatch[]> {
  if (!lastName) return []

  const { data } = await supabase
    .from('guest_list_entries')
    .select('id, first_name, last_name')
    .eq('show_id', showId)
    .in('status', ['requested', 'approved'])
    .ilike('last_name', lastName)

  return (data ?? []).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
  }))
}

// A show's list for the panel, plus its allotments and the two shows columns.
// Draft and removed rows are excluded: a draft is an in-progress chat request
// the TM never sees, and a removed row is off the list. A failed read returns an
// error so the panel can say "Could not load the guest list" rather than showing
// an empty, confident, wrong list.
export async function getGuestList(showId: string): Promise<GuestListView> {
  await requireUser()

  const empty: GuestListView = {
    error: null,
    entries: [],
    allotments: [],
    cutoffAt: null,
    locked: false,
    timezone: 'UTC',
  }

  const supabase = await createClient()

  const show = await resolveShowTour(supabase, showId)
  if (!show) return { ...empty, error: 'Could not load the guest list.' }

  const [
    { data: entries, error: entriesError },
    { data: allotments, error: allotmentsError },
    { data: tour },
  ] = await Promise.all([
    supabase
      .from('guest_list_entries')
      .select('*')
      .eq('show_id', showId)
      .in('status', ['requested', 'approved', 'declined'])
      .order('created_at', { ascending: true }),
    supabase.from('guest_list_allotments').select('*').eq('show_id', showId),
    supabase.from('tours').select('timezone').eq('id', show.tour_id).maybeSingle(),
  ])

  if (entriesError || allotmentsError) {
    console.error(
      '[guest-list] could not load the list:',
      entriesError?.message ?? allotmentsError?.message,
    )
    return { ...empty, error: 'Could not load the guest list.' }
  }

  return {
    error: null,
    entries: entries ?? [],
    allotments: allotments ?? [],
    cutoffAt: show.guest_list_cutoff_at,
    locked: show.guest_list_locked,
    timezone: tour?.timezone ?? 'UTC',
  }
}

// The TM's own add. A name the TM types is on the list, so it writes 'approved'
// directly with no requester, rather than 'requested' then approved. It runs the
// duplicate check and returns any match to the caller instead of refusing.
export async function createGuestEntry(
  data: z.infer<typeof createGuestEntrySchema>,
): Promise<GuestEntryActionState> {
  await requireUser()

  const parsed = createGuestEntrySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const input = parsed.data

  // show_id and tour_id arrive together in one payload, and RLS does not check
  // they share a tour. Without this an entry could be written onto another
  // tour's show, which passes RLS on both reads.
  if (!(await showIsOnTour(supabase, input.show_id, input.tour_id))) {
    return { error: 'Show not found on this tour.' }
  }

  // An 'approved' row is not a draft, so guest_list_entries_named_unless_draft
  // requires both names. Said here as a sentence before the insert rather than
  // let through to a raw constraint-violation message.
  if (!input.first_name || !input.last_name) {
    return { error: 'A guest needs a first and last name.' }
  }

  const duplicates = await findSurnameMatches(supabase, input.show_id, input.last_name)

  const row: TablesInsert<'guest_list_entries'> = {
    tour_id: input.tour_id,
    show_id: input.show_id,
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email ?? null,
    guest_type: input.guest_type ?? null,
    num_tickets: input.num_tickets ?? 1,
    pass_type: input.pass_type ?? 'ticket',
    pass_type_detail: input.pass_type_detail ?? null,
    pickup: input.pickup ?? null,
    pickup_detail: input.pickup_detail ?? null,
    priority: input.priority ?? false,
    notes: input.notes ?? null,
    request_channel: 'app',
    requested_by_person_id: null,
    status: 'approved',
  }

  const { data: created, error } = await supabase
    .from('guest_list_entries')
    .insert(row)
    .select('id')
    .single()

  if (error || !created) return { error: error?.message ?? 'Could not add this guest.' }

  revalidatePath(`/tours/${input.tour_id}/schedule`)

  return { error: null, entryId: created.id, duplicates }
}

// The partial-write path, and the one most likely to destroy data. Skip fields
// the form did not send (undefined), write fields the TM cleared (null), and
// hand the whole row to definedOnly() in one call. Writing `field: value ?? null`
// here is the bug that nulls every column a subset form omitted.
export async function updateGuestEntry(
  entryId: string,
  data: z.infer<typeof updateGuestEntrySchema>,
): Promise<GuestEntryActionState> {
  await requireUser()

  const parsed = updateGuestEntrySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const input = parsed.data

  // RLS restricts this to entries on tours the caller owns, so the row coming
  // back is the ownership check and its tour_id is the scope for the revalidate.
  const { data: existing } = await supabase
    .from('guest_list_entries')
    .select('id, tour_id')
    .eq('id', entryId)
    .maybeSingle()

  if (!existing) return { error: 'That guest is no longer on the list.' }

  const row = definedOnly<TablesUpdate<'guest_list_entries'>>({
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    guest_type: input.guest_type,
    num_tickets: input.num_tickets,
    pass_type: input.pass_type,
    pass_type_detail: input.pass_type_detail,
    pickup: input.pickup,
    pickup_detail: input.pickup_detail,
    priority: input.priority,
    notes: input.notes,
  })

  if (Object.keys(row).length === 0) return { error: null, entryId }

  const { error } = await supabase.from('guest_list_entries').update(row).eq('id', entryId)

  if (error) return { error: error.message }

  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return { error: null, entryId }
}

// Approve and decline are narrow actions, not a whole-row update, which sidesteps
// the undefined-versus-null problem entirely. Both take the tour they act under
// so the shared core can scope its read by it: an entry id from another tour is
// not found rather than actioned from the wrong surface.
export async function approveGuestEntry(
  tourId: string,
  entryId: string,
): Promise<ApproveActionState> {
  await requireUser()

  const supabase = await createClient()

  const outcome = await decideGuestEntry(supabase, { entryId, tourId, decision: 'approve' })
  if (outcome.error) return { error: outcome.error }

  revalidatePath(`/tours/${tourId}/schedule`)

  return {
    error: null,
    alreadyDecided: outcome.alreadyDecided,
    overAllotment: outcome.overAllotment ?? null,
  }
}

export async function declineGuestEntry(
  tourId: string,
  entryId: string,
  reason?: string | null,
): Promise<DecideActionState> {
  await requireUser()

  const supabase = await createClient()

  const outcome = await decideGuestEntry(supabase, {
    entryId,
    tourId,
    decision: 'decline',
    reason: reason ?? null,
  })
  if (outcome.error) return { error: outcome.error }

  revalidatePath(`/tours/${tourId}/schedule`)

  return { error: null, alreadyDecided: outcome.alreadyDecided }
}

// Soft delete. A removed row is off every count and every list, but the record
// of who asked survives, which is the question the promoter asks when more names
// turn up than there are spots.
export async function removeGuestEntry(entryId: string): Promise<GuestListActionState> {
  await requireUser()

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('guest_list_entries')
    .select('id, tour_id')
    .eq('id', entryId)
    .maybeSingle()

  if (!existing) return { error: 'That guest is no longer on the list.' }

  const { error } = await supabase
    .from('guest_list_entries')
    .update({ status: 'removed' })
    .eq('id', entryId)

  if (error) return { error: error.message }

  // A removed request is off the list, so drop its Inbox row too.
  await resolveGuestRequestAttention(supabase, { tourId: existing.tour_id, entryId })

  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return { error: null }
}

// Upserts on the (show_id, pass_type) unique index. num_allowed = 0 is a real
// value meaning "none allowed", distinct from no row meaning "no limit".
export async function setGuestListAllotment(
  showId: string,
  passType: string,
  numAllowed: number,
): Promise<GuestListActionState> {
  await requireUser()

  const parsed = guestListAllotmentSchema.safeParse({
    show_id: showId,
    pass_type: passType,
    num_allowed: numAllowed,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  const show = await resolveShowTour(supabase, showId)
  if (!show) return { error: 'Show not found on this tour.' }

  const { error } = await supabase.from('guest_list_allotments').upsert(
    {
      tour_id: show.tour_id,
      show_id: showId,
      pass_type: parsed.data.pass_type,
      num_allowed: parsed.data.num_allowed,
    },
    { onConflict: 'show_id,pass_type' },
  )

  if (error) return { error: error.message }

  revalidatePath(`/tours/${show.tour_id}/schedule`)

  return { error: null }
}

// Writes shows.guest_list_cutoff_at. Null clears the cutoff. No tour-level
// inheritance and no default: a cutoff that silently closes a list is worse than
// none, because the first the TM hears of it is a crew member being refused.
export async function setGuestListCutoff(
  showId: string,
  cutoffAt: string | null,
): Promise<GuestListActionState> {
  await requireUser()

  const parsed = guestListCutoffSchema.safeParse({ show_id: showId, cutoff_at: cutoffAt })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  const show = await resolveShowTour(supabase, showId)
  if (!show) return { error: 'Show not found on this tour.' }

  const { error } = await supabase
    .from('shows')
    .update({ guest_list_cutoff_at: parsed.data.cutoff_at })
    .eq('id', showId)

  if (error) return { error: error.message }

  revalidatePath(`/tours/${show.tour_id}/schedule`)

  return { error: null }
}

// Writes shows.guest_list_locked, the manual lock, independent of the cutoff.
// Either one closes the list to crew. Neither ever blocks the TM.
export async function setGuestListLock(
  showId: string,
  locked: boolean,
): Promise<GuestListActionState> {
  await requireUser()

  const parsed = guestListLockSchema.safeParse({ show_id: showId, locked })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  const show = await resolveShowTour(supabase, showId)
  if (!show) return { error: 'Show not found on this tour.' }

  const { error } = await supabase
    .from('shows')
    .update({ guest_list_locked: parsed.data.locked })
    .eq('id', showId)

  if (error) return { error: error.message }

  revalidatePath(`/tours/${show.tour_id}/schedule`)

  return { error: null }
}

// Enqueues the confirmation send. Omitting entryIds means everyone approved with
// an email and no notified_at. The job writes notified_at only after the send
// returns, so a failed send retries rather than looking sent. This action just
// resolves the target set and hands it off; the send job is a later step of the
// brief.
export async function sendGuestConfirmations(
  showId: string,
  entryIds?: string[],
): Promise<SendConfirmationsState> {
  await requireUser()

  const supabase = await createClient()

  const show = await resolveShowTour(supabase, showId)
  if (!show) return { error: 'Show not found on this tour.' }

  // Approved, has an email, not yet told. entryIds narrows the set when the TM
  // sends to a subset; the same query still applies so a stale id or an already
  // notified one cannot be forced through.
  let query = supabase
    .from('guest_list_entries')
    .select('id')
    .eq('show_id', showId)
    .eq('status', 'approved')
    .not('email', 'is', null)
    .is('notified_at', null)

  // Guard the .in(): an empty entryIds is a request to send to nobody, and an
  // empty .in() is a round trip that can only return nothing.
  if (entryIds) {
    if (entryIds.length === 0) return { error: null, count: 0 }
    query = query.in('id', entryIds)
  }

  const { data: targets, error } = await query
  if (error) return { error: error.message }

  const ids = (targets ?? []).map((row) => row.id)
  if (ids.length === 0) return { error: null, count: 0 }

  await tasks.trigger('guest-confirmation-send', { showId, entryIds: ids })

  revalidatePath(`/tours/${show.tour_id}/schedule`)

  return { error: null, count: ids.length }
}
