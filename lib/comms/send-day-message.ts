import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTimezone, localDayWindowUtc, addDays } from '@/lib/schedule/datetime'
import { buildMorningMessageData } from '@/lib/comms/templates/morning-message'
import { notify, type ChannelOutcome } from '@/lib/comms/notify'
import {
  resolveDayBlocks,
  selectShowInfoVariant,
  selectCateringVariant,
  selectWrapVariant,
  type DayBlockInput,
  type WrapOnwardLeg,
  type BlockType,
} from '@/lib/comms/blocks/select'
import { showBlockTimesFromItems, type ShowBlockTimes } from '@/lib/comms/blocks/show-times'
import { fetchShowItems } from '@/lib/schedule/day-items'
import type {
  OpenerData,
  ShowInfoData,
  CateringData,
  WrapData,
} from '@/lib/comms/templates/day-blocks'
import type { NotificationDataMap, NotifyContact } from '@/lib/comms/notify/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Everyone on the tour with at least one usable address. Telegram counts: a
// Telegram-only contact has no whatsapp_number and no contact_email, so
// filtering on those two alone would drop them before notify() ever resolved
// their channels. This is the one definition of "contactable" for a day send,
// shared with lib/actions/day-message.ts's resend preview/confirm so the count
// a TM sees before pressing the button never drifts from who the send below
// actually reaches. Works on either the RLS or the admin client: the caller
// decides which is appropriate for its own tour-ownership check.
//
// sendDayMessage itself does not call this: it needs the fuller contact row
// (name, operational_channel, email_enabled) to avoid notify() re-fetching it
// per block per person (REE-108), so it runs its own richer query below with
// the same filter.
export async function fetchContactablePeople(
  supabase: SupabaseClient<Database>,
  tourId: string
): Promise<{ people: { id: string }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('people')
    .select('id, contacts(whatsapp_number, telegram_chat_id, contact_email)')
    .eq('tour_id', tourId)

  if (error) return { people: [], error: error.message }

  const people = (data ?? []).filter((r) => {
    const c = r.contacts as {
      whatsapp_number: string | null
      telegram_chat_id: number | null
      contact_email: string | null
    } | null
    return !!(c?.whatsapp_number || c?.telegram_chat_id || c?.contact_email)
  })

  return { people, error: null }
}

// The send half of the show-day message: given a tour and a date, sends the
// opener/show-information/catering/wrap block sequence and the email digest
// to everyone contactable on the tour. Extracted from the 07:00 schedule so a
// manual resend button can call the same path (REE-102).
//
// Seconds between each block send per person. Enough to read like texting
// rather than a dump, short enough not to feel like two separate conversations.
const STAGGER_SECONDS = 4

// Formats a YYYY-MM-DD date string as "Mon 14 Jul" for the opener block.
function formatShowDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

async function runConcurrently<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  concurrency: number,
  onRejected: (item: T, error: unknown) => void
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const settled = await Promise.allSettled(batch.map(fn))
    settled.forEach((result, idx) => {
      if (result.status === 'rejected') onRejected(batch[idx], result.reason)
    })
  }
}

export interface SendDayMessageInput {
  tourId: string
  // YYYY-MM-DD, the tour-local date to send for.
  date: string
  timezone: string
  artistName: string
  // What makes this run unique for dedup purposes. The 07:00 schedule passes
  // `date` again here; a resend button can pass something else to force a
  // fresh send without touching the original dedup key.
  dedupDimension: string
  // Injected so the caller decides how to wait between blocks: Trigger.dev's
  // wait.for from the schedule, a no-op from a test or a manual send.
  stagger: (seconds: number) => Promise<void>
}

export interface SendDayMessageResult {
  skipped?: true
  reason?: string
  date: string
  people_count: number
  results: { person_id: string; channels: ChannelOutcome[] }[]
  failures: { person_id: string; error: string }[]
}

export async function sendDayMessage(input: SendDayMessageInput): Promise<SendDayMessageResult> {
  const { tourId, date, timezone, artistName, dedupDimension, stagger } = input
  const admin = createAdminClient()

  // catering_type comes off the show since REE-19 moved it there. timezone
  // rides along so the show's own resolved venue zone, once known, wins over
  // the tour's for every block below (Brief 56).
  const { data: show, error: showError } = await admin
    .from('shows')
    .select('id, venue_name, date, catering_type, timezone')
    .eq('tour_id', tourId)
    .eq('date', date)
    .maybeSingle()

  // maybeSingle() errors rather than returning a row when more than one show
  // matches. Nothing in the database prevents two shows on one tour_date_id,
  // so this is a real state: a discarded error here used to read as
  // no_show_today and send nothing, with no sign anything had gone wrong.
  if (showError) {
    console.error('[send-day-message] more than one show on this date:', showError, { tourId, date })
    return { skipped: true, reason: 'two_shows', date, people_count: 0, results: [], failures: [] }
  }

  if (!show) {
    return { skipped: true, reason: 'no_show_today', date, people_count: 0, results: [], failures: [] }
  }

  const showTimezone = resolveTimezone(show, timezone)

  // The show's running order, collapsed to one value per kind for the Meta
  // templates, which have fixed placeholders. See lib/comms/blocks/show-times.ts
  // for why that collapse is the channel's constraint and not a return to
  // columns.
  const { items, error: itemsError } = await fetchShowItems(admin, show.id)

  // A failed read is not a day with no times. Sending an opener and a wrap
  // block with no show information, to everyone on the tour, because a query
  // failed, is worse than sending nothing: the TM sees a delivered morning
  // message and has no reason to look. Skipped and named so the Trigger.dev
  // run says why, which is the only place this is visible.
  if (itemsError) {
    console.error('[send-day-message] day items lookup failed:', itemsError, { tourId })
    return { skipped: true, reason: 'day_items_read_failed', date, people_count: 0, results: [], failures: [] }
  }

  const daySheet = showBlockTimesFromItems(items, show.catering_type)

  // Everyone on the tour with at least one usable address. Telegram counts:
  // a Telegram-only contact has no whatsapp_number and no contact_email, so
  // filtering on those two alone dropped them before notify() ever resolved
  // their channels. This pre-filter only skips people with no address at all;
  // resolveChannels still makes the real per-notification decision.
  //
  // Selects everything notify() itself would otherwise query per call (name,
  // operational_channel, email_enabled alongside the three addresses), so the
  // same contact row fetched here once per person is reused for every block
  // send and the digest below, instead of notify() re-fetching it each time
  // (REE-108).
  const { data: peopleRows } = await admin
    .from('people')
    .select('id, contacts(name, whatsapp_number, telegram_chat_id, contact_email, operational_channel, email_enabled)')
    .eq('tour_id', tourId)

  const people = (peopleRows ?? [])
    .map((r) => ({ id: r.id, contact: r.contacts as NotifyContact | null }))
    .filter((p) => !!(p.contact?.whatsapp_number || p.contact?.telegram_chat_id || p.contact?.contact_email))

  if (people.length === 0) {
    return { skipped: true, reason: 'no_contactable_people', date, people_count: 0, results: [], failures: [] }
  }

  const results: { person_id: string; channels: ChannelOutcome[] }[] = []
  const failures: { person_id: string; error: string }[] = []

  await runConcurrently(
    people,
    async (person) => {
      // Look for a ground segment assigned to this person departing after
      // curfew on the same day. This is the onward travel the wrap block needs.
      let onwardLeg: WrapOnwardLeg | null = null
      if (daySheet?.curfew) {
        // The window runs from curfew through the end of the following local
        // calendar day, so a post-midnight onward leg (the whole reason this
        // query exists) is still in range. The boundary is midnight local to
        // the tour, not UTC midnight: `${nextDay}T00:00:00Z` is only correct
        // for a tour on UTC and is silently wrong at the edges for every
        // other one.
        const nextDay = addDays(date, 1)
        const { end: wrapWindowEnd } = localDayWindowUtc(nextDay, timezone)
        const { data: leg } = await admin
          .from('transport_assignments')
          .select('transport_segments!inner(mode, destination, depart_at)')
          .eq('person_id', person.id)
          .eq('tour_id', tourId)
          .gte('transport_segments.depart_at', daySheet.curfew)
          .lt('transport_segments.depart_at', wrapWindowEnd)
          .limit(1)
          .maybeSingle()

        if (leg) {
          const seg = leg.transport_segments as {
            mode: string
            destination: string | null
            depart_at: string
          } | null
          if (seg) {
            onwardLeg = { mode: seg.mode, destination: seg.destination, depart_at: seg.depart_at }
          }
        }
      }

      // Block plan: which blocks fire today for this person. ShowBlockTimes is
      // a superset of DayBlockInput, so the resolved times are the input.
      const blockInput: DayBlockInput = daySheet

      const blockPlan = resolveDayBlocks(blockInput, onwardLeg)

      // First name for the opener block, off the contact row fetched once
      // above for the whole tour rather than re-queried per person.
      const firstName = (person.contact?.name ?? '').split(' ')[0]

      // Send each block in sequence with a stagger so it reads like texting.
      let isFirst = true
      for (const blockType of blockPlan) {
        if (!isFirst) await stagger(STAGGER_SECONDS)
        isFirst = false

        const data = buildBlockData(blockType, {
          personId: person.id,
          firstName,
          artistName,
          show,
          today: date,
          daySheet,
          onwardLeg,
          timezone: showTimezone,
          blockInput,
        })

        const result = await notify({
          tourId,
          personId: person.id,
          type: blockType,
          data,
          dedupDimension,
          contact: person.contact,
        })

        results.push({ person_id: person.id, channels: result.channels })
      }

      // Email digest: no WhatsApp renderer so resolveChannels skips
      // WhatsApp contacts automatically. Email-preferring contacts get
      // this consolidated view instead of the block sequence.
      const morningData = await buildMorningMessageData(person.id, show.id, showTimezone, firstName)
      if (morningData) {
        const result = await notify({
          tourId,
          personId: person.id,
          type: 'morning_message',
          data: morningData,
          dedupDimension,
          contact: person.contact,
        })
        results.push({ person_id: person.id, channels: result.channels })
      }
    },
    5,
    // Previously discarded: Promise.allSettled's rejections went unread, so a
    // per-person exception simply vanished and the run reported success.
    (person, error) => {
      console.error('[send-day-message] per-person send failed:', error, { tourId, personId: person.id })
      failures.push({
        person_id: person.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  )

  return { date, people_count: people.length, results, failures }
}

// Assembles the typed data object for a given block type.
function buildBlockData(
  blockType: BlockType,
  ctx: {
    personId: string
    firstName: string
    artistName: string
    show: { venue_name: string; date: string }
    today: string
    // Named daySheet still, and it is a day_items view now. Renaming it reaches
    // every branch below for no behaviour change, and the contract migration
    // (REE-23) is where that vocabulary sweep belongs.
    daySheet: ShowBlockTimes
    onwardLeg: WrapOnwardLeg | null
    timezone: string
    blockInput: DayBlockInput
  }
): NotificationDataMap[BlockType] {
  const ds = ctx.daySheet

  switch (blockType) {
    case 'opener': {
      const d: OpenerData = {
        personId: ctx.personId,
        person_first_name: ctx.firstName,
        artist_name: ctx.artistName,
        venue_name: ctx.show.venue_name,
        show_date: formatShowDate(ctx.today),
      }
      return d
    }

    case 'show_information': {
      const variant = selectShowInfoVariant(ctx.blockInput)!
      const d: ShowInfoData = {
        personId: ctx.personId,
        variant,
        load_in: ds?.load_in ?? null,
        soundcheck: ds?.soundcheck ?? null,
        changeover: ds?.changeover ?? null,
        headliner_on: ds?.headliner_on ?? null,
        timezone: ctx.timezone,
      }
      return d
    }

    case 'catering': {
      const variant = selectCateringVariant(ctx.blockInput)!
      const d: CateringData = {
        personId: ctx.personId,
        variant,
        catering_breakfast_start: ds?.catering_breakfast_start ?? null,
        catering_breakfast_end: ds?.catering_breakfast_end ?? null,
        catering_lunch_start: ds?.catering_lunch_start ?? null,
        catering_lunch_end: ds?.catering_lunch_end ?? null,
        catering_dinner_start: ds?.catering_dinner_start ?? null,
        catering_dinner_end: ds?.catering_dinner_end ?? null,
        timezone: ctx.timezone,
      }
      return d
    }

    case 'wrap': {
      const variant = selectWrapVariant(ds?.curfew ?? null, ctx.onwardLeg)!
      const d: WrapData = {
        personId: ctx.personId,
        variant,
        curfew: ds?.curfew ?? null,
        onwardLeg: ctx.onwardLeg,
        timezone: ctx.timezone,
      }
      return d
    }
  }
}
