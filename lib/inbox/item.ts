import type { createClient } from '@/lib/supabase/server'
import type { ExtractionProposal } from '@/lib/ai/extract'
import { resolveTimezone } from '@/lib/schedule/datetime'

// The single-item read behind the Inbox item detail route (brief 53, REE-152).
// Scoped by account the same way fetchInbox scopes the list (lib/inbox/query.ts):
// tours!inner so a filter on tours.account_id actually filters, per CLAUDE.md's
// "a filter on an embedded table needs !inner".
//
// guest_request and email_extraction each have a subject resolver (REE-154
// added the second). Any other kind comes back with item set and subject
// null, and the route renders a plain fallback rather than a 404: a real
// backfilled row already exists in production and a TM can click it before
// that kind gets its own view.

type Client = Awaited<ReturnType<typeof createClient>>

export interface InboxItemDetail {
  id: string
  tour_id: string
  tour_name: string
  // The zone this item's relative label renders in: the related show's own
  // resolved venue zone when this item is joined to one (a guest request),
  // otherwise the tour's fallback. See resolveTimezone in
  // lib/schedule/datetime.ts.
  timezone: string | null
  artist_id: string
  artist_name: string
  kind: string
  severity: number
  title: string
  detail: string | null
  related_table: string | null
  related_id: string | null
  created_at: string
  read_at: string | null
  resolved_at: string | null
}

export interface GuestRequestSubject {
  entryId: string
  showId: string
  status: string
  firstName: string | null
  lastName: string | null
  email: string | null
  numTickets: number
  passType: string
  passTypeDetail: string | null
  pickup: string | null
  pickupDetail: string | null
  notes: string | null
  requesterName: string | null
  requesterRole: string | null
  venueName: string
  showDate: string
  // The show's own resolved venue zone when it has one, otherwise the tour's
  // fallback. fetchInboxItem carries this back onto the item's own timezone
  // field, so the relative label on the detail page agrees with it.
  timezone: string
  cutoffAt: string | null
  locked: boolean
  // Approved tickets against the show's allotment for this pass type. Null
  // when the show has no allotment row for it, meaning no limit, the same
  // "no row means no limit" reading lib/guest-list/decide.ts uses.
  allotment: { used: number; allowed: number } | null
}

// The extraction detail subject (REE-154): the forwarded email plus its
// proposed rows, read straight off forwarded_emails. proposed_rows is nullable
// (extraction can fail before ever calling the model), so a null reads as the
// same empty proposal runExtraction itself falls back to on failure.
export interface ExtractionSubject {
  forwardedEmailId: string
  status: string
  fromAddress: string | null
  subjectLine: string | null
  bodyText: string | null
  proposal: ExtractionProposal
}

const EMPTY_PROPOSAL: ExtractionProposal = { shows: [], transport_segments: [], hotel_stays: [] }

export interface InboxItemResult {
  item: InboxItemDetail | null
  subject: GuestRequestSubject | ExtractionSubject | null
  // The one exception to "producers create rows and producers resolve them"
  // (brief 53): related_id points at a row that is no longer there. True only
  // when the read itself succeeded and came back empty, never on a failed read.
  danglingPointer: boolean
  error: string | null
}

export async function fetchInboxItem(
  supabase: Client,
  accountId: string,
  itemId: string,
): Promise<InboxItemResult> {
  const empty: InboxItemResult = { item: null, subject: null, danglingPointer: false, error: null }

  const { data, error } = await supabase
    .from('attention_items')
    .select(
      `
      id,
      tour_id,
      kind,
      severity,
      title,
      detail,
      related_table,
      related_id,
      created_at,
      read_at,
      resolved_at,
      tours!inner (
        name,
        account_id,
        timezone,
        artists!inner ( id, name )
      )
    `
    )
    .eq('id', itemId)
    .eq('tours.account_id', accountId)
    .maybeSingle()

  // A failed read must never render as an empty result (CLAUDE.md): the caller
  // needs to tell "not found" and "broken query" apart.
  if (error) return { ...empty, error: error.message }
  if (!data) return empty

  const tour = data.tours as unknown as {
    name: string
    timezone: string | null
    artists: { id: string; name: string }
  }

  const item: InboxItemDetail = {
    id: data.id,
    tour_id: data.tour_id,
    tour_name: tour.name,
    timezone: tour.timezone,
    artist_id: tour.artists.id,
    artist_name: tour.artists.name,
    kind: data.kind,
    severity: data.severity,
    title: data.title,
    detail: data.detail,
    related_table: data.related_table,
    related_id: data.related_id,
    created_at: data.created_at,
    read_at: data.read_at,
    resolved_at: data.resolved_at,
  }

  if (item.kind === 'guest_request' && item.related_table === 'guest_list_entries' && item.related_id) {
    const { subject, error: subjectError } = await fetchGuestRequestSubject(
      supabase,
      item.related_id,
      tour.timezone,
    )
    if (subjectError) return { item, subject: null, danglingPointer: false, error: subjectError }
    if (!subject) return { item, subject: null, danglingPointer: true, error: null }
    // The subject already resolved the show's own venue zone; the item's own
    // label should agree with it rather than the tour's fallback.
    return { item: { ...item, timezone: subject.timezone }, subject, danglingPointer: false, error: null }
  }

  if (item.kind === 'email_extraction' && item.related_table === 'forwarded_emails' && item.related_id) {
    const { subject, error: subjectError } = await fetchExtractionSubject(supabase, item.related_id)
    if (subjectError) return { item, subject: null, danglingPointer: false, error: subjectError }
    if (!subject) return { item, subject: null, danglingPointer: true, error: null }
    return { item, subject, danglingPointer: false, error: null }
  }

  return { item, subject: null, danglingPointer: false, error: null }
}

// The email plus its proposed rows, read straight off forwarded_emails. A
// gone row (deleted, or from another tour) comes back as no row and no error,
// same dangling-pointer shape as fetchGuestRequestSubject.
async function fetchExtractionSubject(
  supabase: Client,
  forwardedEmailId: string,
): Promise<{ subject: ExtractionSubject | null; error: string | null }> {
  const { data, error } = await supabase
    .from('forwarded_emails')
    .select('id, from_address, subject, body_text, extraction_status, proposed_rows')
    .eq('id', forwardedEmailId)
    .maybeSingle()

  if (error) return { subject: null, error: error.message }
  if (!data) return { subject: null, error: null }

  return {
    subject: {
      forwardedEmailId: data.id,
      status: data.extraction_status,
      fromAddress: data.from_address,
      subjectLine: data.subject,
      bodyText: data.body_text,
      proposal: (data.proposed_rows as ExtractionProposal | null) ?? EMPTY_PROPOSAL,
    },
    error: null,
  }
}

// The entry, its show and its requester, in one read: guest_list_entries has a
// single FK to shows (show_id) and a single FK to people
// (requested_by_person_id), so both embed unambiguously with no join hint
// needed. A deleted entry, or an entry whose show was itself deleted, comes
// back as no row and no error: that is the dangling-pointer case, not a
// failure, so it is returned as { subject: null, error: null } and the caller
// tells the two apart by whether error is set.
async function fetchGuestRequestSubject(
  supabase: Client,
  entryId: string,
  tourTimezone: string | null,
): Promise<{ subject: GuestRequestSubject | null; error: string | null }> {
  const { data, error } = await supabase
    .from('guest_list_entries')
    .select(
      `
      id,
      show_id,
      status,
      first_name,
      last_name,
      email,
      num_tickets,
      pass_type,
      pass_type_detail,
      pickup,
      pickup_detail,
      notes,
      shows ( id, venue_name, date, guest_list_cutoff_at, guest_list_locked, timezone ),
      people ( role, contacts ( name ) )
    `
    )
    .eq('id', entryId)
    .maybeSingle()

  if (error) return { subject: null, error: error.message }
  if (!data) return { subject: null, error: null }

  const show = data.shows as unknown as {
    id: string
    venue_name: string
    date: string
    guest_list_cutoff_at: string | null
    guest_list_locked: boolean
    timezone: string | null
  } | null

  // shows.tour_id cascades on tour delete; a gone show is the same
  // no-longer-here state as a gone entry.
  if (!show) return { subject: null, error: null }

  const person = data.people as unknown as {
    role: string | null
    contacts: { name: string } | null
  } | null

  const allotment = await fetchAllotmentUsage(supabase, show.id, data.pass_type)

  return {
    subject: {
      entryId: data.id,
      showId: show.id,
      status: data.status,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      numTickets: data.num_tickets,
      passType: data.pass_type,
      passTypeDetail: data.pass_type_detail,
      pickup: data.pickup,
      pickupDetail: data.pickup_detail,
      notes: data.notes,
      requesterName: person?.contacts?.name ?? null,
      requesterRole: person?.role ?? null,
      venueName: show.venue_name,
      showDate: show.date,
      timezone: resolveTimezone(show, tourTimezone),
      cutoffAt: show.guest_list_cutoff_at,
      locked: show.guest_list_locked,
      allotment,
    },
    error: null,
  }
}

// A secondary, best-effort read: the allotment line is enrichment, not the
// record itself, so a failed count here drops the line rather than failing
// the whole item (logged, same as fetchGuestListSummary's tolerance).
async function fetchAllotmentUsage(
  supabase: Client,
  showId: string,
  passType: string,
): Promise<{ used: number; allowed: number } | null> {
  const { data: allotment, error: allotmentError } = await supabase
    .from('guest_list_allotments')
    .select('num_allowed')
    .eq('show_id', showId)
    .eq('pass_type', passType)
    .maybeSingle()

  if (allotmentError) {
    console.error('[inbox] could not load the allotment:', allotmentError.message)
    return null
  }
  if (!allotment) return null

  const { data: approved, error: approvedError } = await supabase
    .from('guest_list_entries')
    .select('num_tickets')
    .eq('show_id', showId)
    .eq('pass_type', passType)
    .eq('status', 'approved')

  if (approvedError) {
    console.error('[inbox] could not count approved tickets:', approvedError.message)
    return null
  }

  const used = (approved ?? []).reduce((sum, row) => sum + (row.num_tickets ?? 0), 0)
  return { used, allowed: allotment.num_allowed }
}
