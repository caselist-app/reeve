import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveParty, type PartyPerson } from '@/lib/party/resolve'

// ChangeDescriptor identifies the record that changed.
// Used by getAffectedPeople and buildChangeMessage to compute
// who to notify and what message to generate.
export type ChangeDescriptor =
  | { type: 'transport_segment'; segmentId: string }
  | { type: 'hotel_stay'; stayId: string }
  // Brief 36 step 3: the two time fields are named for the day-sheet columns that
  // now hold them, not for the show columns that were dropped. Both still
  // identify a show, because who to notify is still decided by the show's date.
  | { type: 'show'; showId: string; field: 'load_in' | 'address' | 'curfew' }
  | { type: 'day_sheet'; showId: string }

export type AffectedPerson = {
  id: string
  name: string
  whatsapp_number: string | null
  contact_email: string | null
}

// A failed read must never render as an empty result (CLAUDE.md). So the answer
// is not "who is affected" alone but "who is affected, and did the query even
// succeed": a null error is a trustworthy list, a non-null error is a list that
// could not be built and must never be shown as "nobody".
export type AffectedResult = {
  people: AffectedPerson[]
  error: string | null
}

// Returns the people who should receive a notification for this change.
// Each case is deliberately narrow: only directly-assigned people are notified
// for transport and hotel changes. Day sheet changes go to everyone contactable.
//
// Every case surfaces its query error rather than swallowing it: a broken read
// and a genuinely unaffected tour look identical from the outside, so the caller
// needs the error to tell them apart.
export async function getAffectedPeople(
  change: ChangeDescriptor,
  tourId: string,
  supabase?: SupabaseClient
): Promise<AffectedResult> {
  const db = supabase ?? (await createClient())

  switch (change.type) {
    case 'transport_segment': {
      const { people, error } = await resolveParty(db, tourId, {
        kind: 'transport_segment',
        ids: [change.segmentId],
      })
      if (error) return { people: [], error }
      return { people: toAffectedPeople(people), error: null }
    }

    case 'hotel_stay': {
      const { people, error } = await resolveParty(db, tourId, {
        kind: 'hotel_stay',
        ids: [change.stayId],
      })
      if (error) return { people: [], error }
      return { people: toAffectedPeople(people), error: null }
    }

    case 'show': {
      // Show changes (load-in, address, curfew) affect:
      // - People traveling on that show's date (segment departs or arrives that day)
      // - People in a hotel that checks in on that show's date
      // Scoped by tour_id as well as id. The date read here selects this tour's
      // segments and stays, so an unscoped read lets another tour's show date
      // decide which of this tour's crew get the message.
      const { data: show, error: showError } = await db
        .from('shows')
        .select('date')
        .eq('id', change.showId)
        .eq('tour_id', tourId)
        .single()

      if (showError) return { people: [], error: showError.message }
      if (!show) return { people: [], error: null }

      const showDate = show.date
      // UTC window for the show date. Using date-prefix slicing avoids timezone
      // drift in the common case (tours are rarely UTC-12 or UTC+14).
      const dayStart = `${showDate}T00:00:00.000Z`
      const nextDay = incrementDate(showDate)
      const dayEnd = `${nextDay}T00:00:00.000Z`

      // Segments departing on the show date.
      const { data: departingSegs, error: departingError } = await db
        .from('transport_segments')
        .select('id')
        .eq('tour_id', tourId)
        .gte('depart_at', dayStart)
        .lt('depart_at', dayEnd)

      if (departingError) return { people: [], error: departingError.message }

      // Segments arriving on the show date (e.g. overnight bus).
      const { data: arrivingSegs, error: arrivingError } = await db
        .from('transport_segments')
        .select('id')
        .eq('tour_id', tourId)
        .gte('arrive_at', dayStart)
        .lt('arrive_at', dayEnd)

      if (arrivingError) return { people: [], error: arrivingError.message }

      const segIds = [
        ...(departingSegs ?? []).map((s) => s.id),
        ...(arrivingSegs ?? []).map((s) => s.id),
      ]

      // Hotels checking in on the show date.
      const { data: stays, error: staysError } = await db
        .from('hotel_stays')
        .select('id')
        .eq('tour_id', tourId)
        .eq('check_in_date', showDate)

      if (staysError) return { people: [], error: staysError.message }

      const stayIds = (stays ?? []).map((s) => s.id)

      const [segResult, hotelResult] = await Promise.all([
        resolveParty(db, tourId, { kind: 'transport_segment', ids: segIds }),
        resolveParty(db, tourId, { kind: 'hotel_stay', ids: stayIds }),
      ])

      if (segResult.error) return { people: [], error: segResult.error }
      if (hotelResult.error) return { people: [], error: hotelResult.error }

      return {
        people: deduplicate(toAffectedPeople([...segResult.people, ...hotelResult.people])),
        error: null,
      }
    }

    case 'day_sheet': {
      // Day sheet changes affect everyone traveling with the tour who has any
      // contact channel (WhatsApp or email). The !inner join excludes people
      // with no contact record at all. notify() resolves the actual channel per
      // person from their preference, so we don't filter by address type here.
      const { data, error } = await db
        .from('people')
        .select('id, contacts!inner(name, whatsapp_number, contact_email)')
        .eq('tour_id', tourId)

      if (error) return { people: [], error: error.message }

      const people = (data ?? []).map((row) => {
        const c = row.contacts as unknown as { name: string; whatsapp_number: string | null; contact_email: string | null } | null
        return {
          id: row.id,
          name: c?.name ?? '',
          whatsapp_number: c?.whatsapp_number ?? null,
          contact_email: c?.contact_email ?? null,
        }
      })

      return { people, error: null }
    }
  }
}

// resolveParty's PartyPerson carries person_type for the day roster's benefit;
// this caller only ever sends messages, so it drops that field.
function toAffectedPeople(people: PartyPerson[]): AffectedPerson[] {
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    whatsapp_number: p.whatsapp_number,
    contact_email: p.contact_email,
  }))
}

function deduplicate(people: AffectedPerson[]): AffectedPerson[] {
  const seen = new Set<string>()
  return people.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

// Adds one calendar day to a YYYY-MM-DD string without Date arithmetic
// to avoid timezone edge cases.
function incrementDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
