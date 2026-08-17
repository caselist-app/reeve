import { localTimeInZone, resolveTimezone } from '@/lib/schedule/datetime'
import { formatShowDate } from '@/lib/comms/guest-request'
import {
  guestConfirmationSubject,
  guestConfirmationHtml,
  type GuestConfirmationData,
} from '@/lib/comms/templates/guest-confirmation'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// The confirmation-email send core, shared by the Trigger.dev job and the
// integration test. Brief 52, step 9 (REE-136).
//
// The same split as lib/guest-list/decide.ts: the job supplies the real email
// adapter, the test supplies a stub, and the logic that decides who gets a mail
// and when notified_at is written lives here so both drive the exact same path.
//
// THE ORDER IS THE POINT. notified_at is written only AFTER send() returns, per
// entry. A send that throws leaves notified_at null, so the entry is picked up
// again on the next send rather than looking notified. This is the same rule as
// every other send path here (claim-send-release, write-state-after-send): never
// mark a send done before it is.

type Client = SupabaseClient<Database>

// A send returns nothing on success and throws on failure. The core never sees a
// provider, only this shape, so the test can throw at will.
export type ConfirmationSender = (email: {
  to: string
  subject: string
  html: string
  artistSlug: string | null
}) => Promise<void>

export interface SendConfirmationsResult {
  // Emails that went out and had their notified_at written.
  sent: number
  // Sends that threw. Their notified_at stays null and they remain re-sendable.
  failed: number
}

type EntryRow = Pick<
  Database['public']['Tables']['guest_list_entries']['Row'],
  | 'id'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'num_tickets'
  | 'pass_type'
  | 'pass_type_detail'
  | 'pickup'
  | 'pickup_detail'
>

// The doors time for the show, as a tour-local "HH:MM", or null when there is no
// doors day_item. Doors is a day_items row, never a column on shows: it hangs off
// the day and references the show, so it is scoped by show_id here. The earliest
// is taken when (rarely) there is more than one.
async function resolveDoorsTime(
  supabase: Client,
  showId: string,
  timezone: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('day_items')
    .select('starts_at')
    .eq('show_id', showId)
    .eq('kind', 'doors')
    .not('starts_at', 'is', null)
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.starts_at ? localTimeInZone(data.starts_at, timezone) : null
}

// Send the confirmation to every approved guest on the show who has an email and
// has not been told yet, optionally narrowed to entryIds. The filter is applied
// here, not just at the enqueue: the list can move between the TM's click and the
// job running, so an entry approved-then-declined, or already notified, is
// re-checked at send time.
export async function sendGuestConfirmationEmails(
  supabase: Client,
  args: { showId: string; entryIds?: string[]; send: ConfirmationSender },
): Promise<SendConfirmationsResult> {
  const { showId, entryIds, send } = args

  // An explicit empty set is a request to send to nobody. Guard it before the
  // .in(), which would otherwise be a round trip that can only return nothing.
  if (entryIds && entryIds.length === 0) return { sent: 0, failed: 0 }

  const { data: show } = await supabase
    .from('shows')
    .select('id, tour_id, venue_name, date, address, timezone')
    .eq('id', showId)
    .maybeSingle()

  if (!show) return { sent: 0, failed: 0 }

  const { data: tour } = await supabase
    .from('tours')
    .select('timezone, artists(name, slug)')
    .eq('id', show.tour_id)
    .maybeSingle()

  // The show's own resolved venue zone wins when it has one; the tour is only
  // the fallback for a show still resolving. See resolveTimezone.
  const timezone = resolveTimezone(show, tour?.timezone ?? null)
  const artist = tour?.artists as { name: string; slug: string | null } | null
  const artistSlug = artist?.slug ?? null
  const artistName = artist?.name ?? null

  const doorsTime = await resolveDoorsTime(supabase, showId, timezone)
  const showDate = formatShowDate(show.date)

  let query = supabase
    .from('guest_list_entries')
    .select(
      'id, first_name, last_name, email, num_tickets, pass_type, pass_type_detail, pickup, pickup_detail',
    )
    .eq('show_id', showId)
    .eq('status', 'approved')
    .not('email', 'is', null)
    .is('notified_at', null)
    .order('created_at', { ascending: true })

  if (entryIds) query = query.in('id', entryIds)

  const { data: entries } = await query
  const rows = (entries ?? []) as EntryRow[]

  let sent = 0
  let failed = 0

  for (const entry of rows) {
    // email is non-null here (the query filters it), so the assertion is safe.
    const data: GuestConfirmationData = {
      guestName: [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim() || 'you',
      venueName: show.venue_name,
      showDate,
      doorsTime,
      address: show.address,
      numTickets: entry.num_tickets,
      passType: entry.pass_type,
      passTypeDetail: entry.pass_type_detail,
      pickup: entry.pickup,
      pickupDetail: entry.pickup_detail,
      artistName,
    }

    try {
      await send({
        to: entry.email!,
        subject: guestConfirmationSubject(data),
        html: guestConfirmationHtml(data),
        artistSlug,
      })
    } catch (err) {
      // Leave notified_at null so the entry is re-sendable, and move on: one bad
      // address must not stop the rest of a bulk send.
      console.error('[guest-confirmation] send failed, entry left re-sendable:', entry.id, err)
      failed++
      continue
    }

    // Only now, after the send returned, is the entry marked told.
    const { error } = await supabase
      .from('guest_list_entries')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', entry.id)

    if (error) {
      console.error('[guest-confirmation] sent but could not mark notified:', entry.id, error.message)
    }
    sent++
  }

  return { sent, failed }
}
