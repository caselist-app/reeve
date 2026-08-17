import { schedules, wait } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTimezone } from '@/lib/schedule/datetime'
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
import type { NotificationDataMap } from '@/lib/comms/notify/types'

// Seconds between each block send per person. Enough to read like texting
// rather than a dump, short enough not to feel like two separate conversations.
const STAGGER_SECONDS = 4

// Returns today's date as YYYY-MM-DD in the given IANA timezone.
function localDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

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
  concurrency: number
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.allSettled(items.slice(i, i + concurrency).map(fn))
  }
}

// Fires daily at 07:00 UTC for each active tour.
// One Trigger.dev schedule is registered per tour on creation (externalId: morning-{tourId}).
// The job resolves today in the tour's local timezone before checking for a show,
// so a show day is never missed due to UTC/local divergence.
export const morningMessageSchedule = schedules.task({
  id: 'morning-message',
  run: async (payload) => {
    const tourId = payload.externalId?.replace(/^morning-/, '')
    if (!tourId) {
      console.error('[morning-message] Missing externalId on schedule payload')
      return { skipped: true, reason: 'no_tour_id' }
    }

    const admin = createAdminClient()

    const { data: tour } = await admin
      .from('tours')
      .select('id, timezone, morning_message_enabled, artists(name)')
      .eq('id', tourId)
      .single()

    if (!tour) return { skipped: true, reason: 'tour_not_found' }
    if (!tour.morning_message_enabled) return { skipped: true, reason: 'opt_in_disabled' }

    const timezone = tour.timezone ?? 'UTC'
    const today = localDate(timezone)
    const artistName = (tour.artists as { name: string } | null)?.name ?? ''

    // catering_type comes off the show since REE-19 moved it there. timezone
    // rides along so the show's own resolved venue zone, once known, wins over
    // the tour's for every block below (Brief 56).
    const { data: show } = await admin
      .from('shows')
      .select('id, venue_name, date, catering_type, timezone')
      .eq('tour_id', tourId)
      .eq('date', today)
      .maybeSingle()

    if (!show) return { skipped: true, reason: 'no_show_today', date: today }

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
      console.error('[morning-message] day items lookup failed:', itemsError, { tourId })
      return { skipped: true, reason: 'day_items_read_failed', date: today }
    }

    const daySheet = showBlockTimesFromItems(items, show.catering_type)

    // Everyone on the tour with at least one usable address. Telegram counts:
    // a Telegram-only contact has no whatsapp_number and no contact_email, so
    // filtering on those two alone dropped them before notify() ever resolved
    // their channels. This pre-filter only skips people with no address at all;
    // resolveChannels still makes the real per-notification decision.
    const { data: peopleRows } = await admin
      .from('people')
      .select('id, contacts(whatsapp_number, telegram_chat_id, contact_email)')
      .eq('tour_id', tourId)

    const people = (peopleRows ?? []).filter((r) => {
      const c = r.contacts as {
        whatsapp_number: string | null
        telegram_chat_id: number | null
        contact_email: string | null
      } | null
      return !!(c?.whatsapp_number || c?.telegram_chat_id || c?.contact_email)
    })

    if (people.length === 0) {
      return { skipped: true, reason: 'no_contactable_people' }
    }

    const results: { person_id: string; channels: ChannelOutcome[] }[] = []

    await runConcurrently(
      people,
      async (person) => {
        // Look for a ground segment assigned to this person departing after
        // curfew on the same day. This is the onward travel the wrap block needs.
        let onwardLeg: WrapOnwardLeg | null = null
        if (daySheet?.curfew) {
          const nextDay = (() => {
            const d = new Date(`${today}T12:00:00.000Z`)
            d.setUTCDate(d.getUTCDate() + 1)
            return d.toISOString().slice(0, 10)
          })()
          const { data: leg } = await admin
            .from('transport_assignments')
            .select('transport_segments!inner(mode, destination, depart_at)')
            .eq('person_id', person.id)
            .eq('tour_id', tourId)
            .gte('transport_segments.depart_at', daySheet.curfew)
            .lt('transport_segments.depart_at', `${nextDay}T00:00:00.000Z`)
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

        // Fetch person's first name for the opener block.
        const { data: personRow } = await admin
          .from('people')
          .select('contacts(name)')
          .eq('id', person.id)
          .single()
        const fullName = (personRow?.contacts as { name: string } | null)?.name ?? ''
        const firstName = fullName.split(' ')[0]

        // Send each block in sequence with a stagger so it reads like texting.
        let isFirst = true
        for (const blockType of blockPlan) {
          if (!isFirst) await wait.for({ seconds: STAGGER_SECONDS })
          isFirst = false

          const data = buildBlockData(blockType, {
            personId: person.id,
            firstName,
            artistName,
            show,
            today,
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
            dedupDimension: today,
          })

          results.push({ person_id: person.id, channels: result.channels })
        }

        // Email digest: no WhatsApp renderer so resolveChannels skips
        // WhatsApp contacts automatically. Email-preferring contacts get
        // this consolidated view instead of the block sequence.
        const morningData = await buildMorningMessageData(person.id, show.id, showTimezone)
        if (morningData) {
          const result = await notify({
            tourId,
            personId: person.id,
            type: 'morning_message',
            data: morningData,
            dedupDimension: today,
          })
          results.push({ person_id: person.id, channels: result.channels })
        }
      },
      5
    )

    return { show_date: today, people_count: people.length, results }
  },
})

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
