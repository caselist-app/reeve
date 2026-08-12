import { localDateInZone, addDays } from '@/lib/schedule/datetime'
import { PASS_TYPES, type PassType } from '@/lib/guest-list/vocabulary'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// The /guest request flow and its parser. Brief 52, step 6 (REE-133).
//
// Two halves. The top of the file is pure and unit tested: parseGuestRequest
// pulls fields out of whatever the crew member typed, and nextGuestQuestion says
// what is still missing. The bottom is stateful: handleGuestRequest walks a
// request through a draft row, one message at a time, until it has a name, an
// email decision and a ticket count (and, for the band, a pass), then promotes
// the draft to a 'requested' entry on the TM's list.
//
// The multi-message state is a draft row, not Redis, by decision (brief 52): a
// draft is a real row in a real Postgres so every transition is assertable, and
// the integration harness stubs Redis with a Proxy that returns null. A draft is
// invisible to the TM, excluded from every count and never notifies. The partial
// unique index guest_list_entries_one_draft_per_person_show means a second /guest
// for the same show from the same person resumes the same draft.
//
// There is no AI on this path and no model call: the parser is deterministic.

type Client = SupabaseClient<Database>

// ---------------------------------------------------------------------------
// Pure parsing
// ---------------------------------------------------------------------------

export interface ParsedGuestRequest {
  // Title-cased, so a crew member typing "dave smith" lands "Dave Smith" on the
  // TM's list. The TM can correct it in the panel.
  firstName: string | null
  lastName: string | null
  // The address if one was found anywhere in the words, else null (not asked or
  // not present). The flow, not the parser, decides whether that means "skip".
  email: string | null
  // The ticket total, counting the guest. "+2" is Dave plus two, so three; a
  // bare "3" is three. Null when no count was typed.
  numTickets: number | null
}

// An email token anywhere in the line. Deliberately loose: this is a first pass
// on free text, and the validator has the last word when the entry is written.
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

// Pull the structured fields out of the text after /guest, in this order: the
// email first (so an address in the middle of the words does not become a
// surname), then a +N or bare integer as the ticket count, then whatever words
// remain as the name, first word to first_name and the rest to last_name.
export function parseGuestRequest(text: string): ParsedGuestRequest {
  let rest = (text ?? '').trim()

  let email: string | null = null
  const emailMatch = rest.match(EMAIL_RE)
  if (emailMatch && emailMatch.index != null) {
    email = emailMatch[0]
    rest = (rest.slice(0, emailMatch.index) + ' ' + rest.slice(emailMatch.index + email.length)).trim()
  }

  let numTickets: number | null = null
  const kept: string[] = []
  for (const word of rest.split(/\s+/).filter(Boolean)) {
    if (numTickets === null) {
      const plus = word.match(/^\+(\d+)$/)
      if (plus) {
        // "+2" is the guest plus two others, so three tickets in total.
        numTickets = parseInt(plus[1], 10) + 1
        continue
      }
      const bare = word.match(/^(\d+)$/)
      if (bare) {
        numTickets = parseInt(bare[1], 10)
        continue
      }
    }
    kept.push(word)
  }

  const firstName = kept.length >= 1 ? titleCase(kept[0]) : null
  const lastName = kept.length >= 2 ? kept.slice(1).map(titleCase).join(' ') : null

  return { firstName, lastName, email, numTickets }
}

export type GuestQuestion = 'name' | 'email' | 'tickets' | 'pass'

export interface GuestQuestionState {
  firstName: string | null
  lastName: string | null
  // An address was given, or the crew member explicitly skipped it. Either way
  // the email question is done and the flow moves on.
  emailResolved: boolean
  // A ticket count was answered.
  ticketsResolved: boolean
  // The requester is on the band and has not yet picked a pass. Only the band are
  // asked which pass; everyone else's request is a ticket.
  needsPass: boolean
}

// The next question to ask, or null when the request is complete. The order is
// the order of the guided flow: name, email, tickets, then pass for the band.
export function nextGuestQuestion(state: GuestQuestionState): GuestQuestion | null {
  if (!state.firstName || !state.lastName) return 'name'
  if (!state.emailResolved) return 'email'
  if (!state.ticketsResolved) return 'tickets'
  if (state.needsPass) return 'pass'
  return null
}

// ---------------------------------------------------------------------------
// Show resolution (shared with the /guestlist render)
// ---------------------------------------------------------------------------

export interface ShowForGuestList {
  id: string
  tour_id: string
  venue_name: string | null
  date: string
  guest_list_cutoff_at: string | null
  guest_list_locked: boolean
}

const SHOW_COLUMNS = 'id, tour_id, venue_name, date, guest_list_cutoff_at, guest_list_locked'

// Shows from today onward in the tour timezone, ordered by date on the top level.
// Ordering on the top level, never on an embedded table: PostgREST silently drops
// an order that names an embedded column, and "the next show" has to be the real
// next show, not an arbitrary one.
async function upcomingShows(
  supabase: Client,
  tourId: string,
  tz: string,
): Promise<ShowForGuestList[]> {
  const today = localDateInZone(new Date().toISOString(), tz)
  const { data } = await supabase
    .from('shows')
    .select(SHOW_COLUMNS)
    .eq('tour_id', tourId)
    .gte('date', today)
    .order('date', { ascending: true })
  return (data ?? []) as ShowForGuestList[]
}

// The next show, or null when the tour has none upcoming. What /guestlist renders
// against and what a /guest with a single imminent show resolves to.
export async function resolveNextShow(
  supabase: Client,
  tourId: string,
  tz: string,
): Promise<ShowForGuestList | null> {
  const shows = await upcomingShows(supabase, tourId, tz)
  return shows[0] ?? null
}

async function loadShow(
  supabase: Client,
  showId: string,
  tourId: string,
): Promise<ShowForGuestList | null> {
  const { data } = await supabase
    .from('shows')
    .select(SHOW_COLUMNS)
    .eq('id', showId)
    .eq('tour_id', tourId)
    .maybeSingle()
  return (data as ShowForGuestList | null) ?? null
}

// The list is closed to crew when it is manually locked or its cutoff has passed.
//
// The cutoff is a full timestamptz the TM set through the panel (fromDatetimeLocal
// reads their wall clock in the tour timezone and stores the UTC instant), so it
// is an absolute moment, not a bare date. Comparing two absolute instants is
// timezone-safe on its own: this is NOT the "${date}T00:00:00Z" midnight trap the
// brief warns about, which is deriving an instant from a date. The tour timezone
// still matters upstream, for resolving which show is next; it does not enter here.
// The cutoff test fixtures a Pacific/Auckland tour on a UTC runner to prove it.
export function isGuestListClosed(show: ShowForGuestList, now: Date): boolean {
  if (show.guest_list_locked) return true
  if (show.guest_list_cutoff_at) {
    return new Date(show.guest_list_cutoff_at).getTime() <= now.getTime()
  }
  return false
}

// ---------------------------------------------------------------------------
// The stateful request flow
// ---------------------------------------------------------------------------

export type GuestRequestOutcome = 'asking' | 'submitted' | 'closed' | 'duplicate' | 'no_show'

export interface GuestRequestResult {
  // The text to send back to the crew member.
  reply: string
  outcome: GuestRequestOutcome
  // The row touched: the draft when still asking, the requested entry when
  // submitted. Absent on closed, duplicate and no_show, which write nothing.
  entryId?: string
}

export interface GuestRequestInput {
  tourId: string
  personId: string
  channel: 'telegram' | 'whatsapp'
  // The message body. For the opening /guest the command is already stripped; for
  // a continuation it is the raw reply.
  text: string
}

type DraftRow = Database['public']['Tables']['guest_list_entries']['Row']

// A draft holds its email as null before the question is asked, '' once the crew
// member skipped it, and the address once given. The '' sentinel is how "asked
// and skipped" is told apart from "not asked yet" without a column, and it is
// converted back to null the moment the draft is promoted, so a real entry never
// carries it.
function emailIsResolved(email: string | null): boolean {
  return email !== null
}

function cleanEmailForEntry(email: string | null): string | null {
  return email && email.length > 0 ? email : null
}

function isSkip(text: string): boolean {
  return /^skip$/i.test(text.trim())
}

function clampTickets(n: number | null): number {
  if (n == null || !Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

const PASS_BY_LABEL = new Map<string, PassType>(
  PASS_TYPES.flatMap((p) => [
    [p.value.toLowerCase(), p.value],
    [p.label.toLowerCase(), p.value],
  ]),
)

// A pass the band member named, matched against both the stored value and the
// display label ('aaa' or 'AAA', 'photo_pass' or 'photo pass'). Null when the
// reply is not a pass, which is how the artist tickets-or-pass turn tells a
// number (a ticket count) from a keyword (a pass choice).
function matchPass(text: string): PassType | null {
  return PASS_BY_LABEL.get(text.trim().toLowerCase()) ?? null
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ')
}

function ticketPhrase(n: number): string {
  return `${n} ${n === 1 ? 'ticket' : 'tickets'}`
}

// A plain calendar date as "Friday 14 June". Weekday and month are properties of
// the date, not of an instant, so a fixed UTC anchor read in UTC is correct: the
// tour timezone cannot move a date onto another weekday. tz is taken for a
// symmetrical signature with the rest of this module.
export function formatShowDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

// True when the person has a /guest request in progress on this tour. The router
// reads this on plain text so a crew member's answers continue the flow instead
// of falling through to the AI layer.
export async function hasOpenGuestDraft(
  supabase: Client,
  tourId: string,
  personId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('guest_list_entries')
    .select('id')
    .eq('tour_id', tourId)
    .eq('requested_by_person_id', personId)
    .eq('status', 'draft')
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

// Existing active names on the show that share this surname, case-insensitive.
// Draft and removed rows do not count: a draft is nobody's request yet, a removed
// row is off the list. Returns who asked so the reply can name them.
async function findSurnameMatches(
  supabase: Client,
  showId: string,
  lastName: string | null,
): Promise<{ id: string; requestedBy: string | null }[]> {
  if (!lastName) return []
  const { data } = await supabase
    .from('guest_list_entries')
    .select('id, requested_by_person_id')
    .eq('show_id', showId)
    .in('status', ['requested', 'approved'])
    .ilike('last_name', lastName)
  return (data ?? []).map((row) => ({ id: row.id, requestedBy: row.requested_by_person_id }))
}

async function requesterName(supabase: Client, personId: string | null): Promise<string | null> {
  if (!personId) return null
  const { data } = await supabase
    .from('people')
    .select('contacts(name)')
    .eq('id', personId)
    .maybeSingle()
  const contact = data?.contacts as { name: string } | null
  return contact?.name ?? null
}

// The working fields for one turn. numTickets and passType are null for "not
// answered yet"; the draft row cannot store that (both columns are NOT NULL with
// a default), so a lingering draft is always read as pre-completion, and the one
// case where a real count is already stored (a band member mid-pass) is recovered
// from the row directly.
interface WorkState {
  firstName: string | null
  lastName: string | null
  email: string | null
  numTickets: number | null
  passType: PassType | null
}

// Which question a lingering draft is waiting on, derived from its nullable
// columns. Because completion promotes the draft out of 'draft', a draft that
// still exists is always sitting at or before the tickets question, so name and
// email are enough to place a crew draft exactly. A band draft can be waiting on
// tickets or on pass; that pair is disambiguated by the shape of the reply, not
// here, so this returns 'tickets' for both and the handler decides.
function draftQuestion(draft: DraftRow): GuestQuestion {
  if (!draft.first_name || !draft.last_name) return 'name'
  if (!emailIsResolved(draft.email)) return 'email'
  return 'tickets'
}

// Handle one inbound message of a /guest flow. Resolves the show, refuses a
// closed list without writing a row, then either asks the next question (holding
// progress in a draft) or, when nothing is missing, runs the duplicate check and
// promotes to a 'requested' entry.
//
// The client is passed in, not built here, so the pure exports above stay free of
// the server-only admin import and can be unit tested. The router hands it the
// admin client; the integration suite hands it the test database.
export async function handleGuestRequest(
  supabase: Client,
  input: GuestRequestInput,
): Promise<GuestRequestResult> {
  const { tourId, personId, channel } = input
  const text = input.text.trim()

  // The requester, and the check that this person is on this tour. RLS is not the
  // gate here (this runs in a job with the admin client), so the person and the
  // show are both scoped to tourId by hand before their ids are used together.
  const { data: person } = await supabase
    .from('people')
    .select('id, tour_id, person_type')
    .eq('id', personId)
    .maybeSingle()
  if (!person || person.tour_id !== tourId) {
    return { reply: 'We could not find you on this tour.', outcome: 'no_show' }
  }
  const isArtist = person.person_type === 'artist'

  const { data: tour } = await supabase
    .from('tours')
    .select('timezone')
    .eq('id', tourId)
    .maybeSingle()
  const tz = tour?.timezone ?? 'UTC'

  // Resolve the show. A draft in progress fixes it; otherwise the next show, and
  // the crew member is only asked to choose when more than one show falls in the
  // coming week (brief 52). A write path cannot guess an ambiguous show: it
  // surfaces the choice as a question.
  const openDraft = await findOpenDraft(supabase, tourId, personId)
  let show: ShowForGuestList | null
  if (openDraft) {
    show = await loadShow(supabase, openDraft.show_id, tourId)
  } else {
    const shows = await upcomingShows(supabase, tourId, tz)
    if (shows.length === 0) {
      return { reply: 'There is no upcoming show to add a guest to.', outcome: 'no_show' }
    }
    const today = localDateInZone(new Date().toISOString(), tz)
    const withinWeek = shows.filter((s) => s.date <= addDays(today, 7))
    if (withinWeek.length > 1) {
      const lines = shows
        .slice(0, 5)
        .map((s) => `- ${s.venue_name ?? 'Show'}, ${formatShowDate(s.date)}`)
      return {
        reply: `Which show?\n${lines.join('\n')}\nSend /guest again with the venue and the guest.`,
        outcome: 'asking',
      }
    }
    show = shows[0]
  }
  if (!show) {
    return { reply: 'There is no upcoming show to add a guest to.', outcome: 'no_show' }
  }

  // A closed list creates nothing, not even a draft. The point of the cutoff is
  // that the TM never sees the request, so a 'requested' row the TM would have to
  // decline by hand is worse than the message never arriving.
  if (isGuestListClosed(show, new Date())) {
    return {
      reply: `The guest list for ${show.venue_name ?? 'this show'} is closed.`,
      outcome: 'closed',
    }
  }

  // The draft for this specific show. The earlier lookup found any open draft to
  // fix the show; this is the row we resume or promote, and it is unique per
  // (person, show) by the partial index.
  const draft = openDraft && openDraft.show_id === show.id ? openDraft : await draftForShow(supabase, show.id, personId)

  const parsed = parseGuestRequest(text)
  const state = applyAnswer(draft, parsed, text, isArtist)

  const question = nextGuestQuestion({
    firstName: state.firstName,
    lastName: state.lastName,
    emailResolved: emailIsResolved(state.email),
    ticketsResolved: state.numTickets !== null,
    needsPass: isArtist && state.passType === null,
  })

  if (question) {
    const entryId = await persistDraft(supabase, {
      draftId: draft?.id ?? null,
      tourId,
      showId: show.id,
      personId,
      channel,
      state,
    })
    return { reply: questionText(question, state, show), outcome: 'asking', entryId }
  }

  // Complete. A name already on the list is surfaced, never a second row: two
  // different people can share a name, so the requester is told who asked and the
  // TM is left to decide from the panel.
  const matches = await findSurnameMatches(supabase, show.id, state.lastName)
  if (matches.length > 0) {
    const asker = await requesterName(supabase, matches[0].requestedBy)
    const name = fullName(state.firstName, state.lastName)
    const who = asker ? `${asker} asked earlier.` : 'It is already on the list.'
    return {
      reply: `${name} is already on the list for ${show.venue_name ?? 'this show'}. ${who}`,
      outcome: 'duplicate',
    }
  }

  const entryId = await promote(supabase, {
    draftId: draft?.id ?? null,
    tourId,
    showId: show.id,
    personId,
    channel,
    state,
    draftTickets: draft?.num_tickets ?? null,
  })

  const name = fullName(state.firstName, state.lastName)
  const tickets = ticketPhrase(clampTickets(state.numTickets ?? draft?.num_tickets ?? null))
  const email = cleanEmailForEntry(state.email)
  const emailPart = email ? `, ${email}` : ''
  return {
    reply: `${show.venue_name ?? 'This show'}, ${formatShowDate(show.date)}. ${name}, ${tickets}${emailPart}. Sent to the TM.`,
    outcome: 'submitted',
    entryId,
  }
}

async function findOpenDraft(
  supabase: Client,
  tourId: string,
  personId: string,
): Promise<DraftRow | null> {
  const { data } = await supabase
    .from('guest_list_entries')
    .select('*')
    .eq('tour_id', tourId)
    .eq('requested_by_person_id', personId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as DraftRow | null) ?? null
}

async function draftForShow(
  supabase: Client,
  showId: string,
  personId: string,
): Promise<DraftRow | null> {
  const { data } = await supabase
    .from('guest_list_entries')
    .select('*')
    .eq('show_id', showId)
    .eq('requested_by_person_id', personId)
    .eq('status', 'draft')
    .maybeSingle()
  return (data as DraftRow | null) ?? null
}

// Fold this message into the known fields. A fresh request takes everything the
// parser found; a continuation answers exactly the question its draft is waiting
// on, which is what lets "skip" mean skip-the-email and a bare number mean the
// ticket count rather than being re-parsed as a name.
function applyAnswer(
  draft: DraftRow | null,
  parsed: ParsedGuestRequest,
  text: string,
  isArtist: boolean,
): WorkState {
  if (!draft) {
    return {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      numTickets: parsed.numTickets,
      passType: null,
    }
  }

  const state: WorkState = {
    firstName: draft.first_name,
    lastName: draft.last_name,
    email: draft.email,
    numTickets: null,
    passType: null,
  }

  const q = draftQuestion(draft)
  if (q === 'name') {
    if (parsed.firstName) state.firstName = parsed.firstName
    if (parsed.lastName) state.lastName = parsed.lastName
    return state
  }
  if (q === 'email') {
    if (parsed.email) state.email = parsed.email
    else if (isSkip(text)) state.email = ''
    // Anything else leaves email unresolved, so the flow asks again.
    return state
  }

  // Name and email are done and the draft still exists, so it is waiting on
  // tickets (crew) or on tickets-then-pass (band). A band draft that already has
  // its count stored is mid-pass: a pass keyword completes it, a number is a
  // correction to the count.
  if (isArtist) {
    const pass = matchPass(text)
    if (pass) {
      state.passType = pass
      state.numTickets = draft.num_tickets
      return state
    }
    state.numTickets = parsed.numTickets ?? draft.num_tickets ?? 1
    return state
  }

  state.numTickets = parsed.numTickets ?? 1
  return state
}

interface DraftWrite {
  draftId: string | null
  tourId: string
  showId: string
  personId: string
  channel: 'telegram' | 'whatsapp'
  state: WorkState
}

async function persistDraft(supabase: Client, args: DraftWrite): Promise<string | undefined> {
  const { draftId, tourId, showId, personId, channel, state } = args
  const fields = {
    first_name: state.firstName,
    last_name: state.lastName,
    email: state.email,
    // A draft's count is a placeholder until the tickets question is answered,
    // except for a band draft mid-pass, whose real count is carried here so it
    // survives to promotion.
    num_tickets: clampTickets(state.numTickets),
  }

  if (draftId) {
    await supabase.from('guest_list_entries').update(fields).eq('id', draftId)
    return draftId
  }

  const { data } = await supabase
    .from('guest_list_entries')
    .insert({
      tour_id: tourId,
      show_id: showId,
      request_channel: channel,
      requested_by_person_id: personId,
      status: 'draft',
      ...fields,
    })
    .select('id')
    .single()
  return data?.id
}

interface PromoteWrite extends DraftWrite {
  draftTickets: number | null
}

async function promote(supabase: Client, args: PromoteWrite): Promise<string | undefined> {
  const { draftId, tourId, showId, personId, channel, state, draftTickets } = args
  const fields = {
    first_name: state.firstName,
    last_name: state.lastName,
    email: cleanEmailForEntry(state.email),
    num_tickets: clampTickets(state.numTickets ?? draftTickets ?? null),
    // Only the band choose a pass; everyone else is a ticket, the column default.
    pass_type: state.passType ?? 'ticket',
    status: 'requested' as const,
  }

  if (draftId) {
    await supabase.from('guest_list_entries').update(fields).eq('id', draftId)
    return draftId
  }

  const { data } = await supabase
    .from('guest_list_entries')
    .insert({
      tour_id: tourId,
      show_id: showId,
      request_channel: channel,
      requested_by_person_id: personId,
      ...fields,
    })
    .select('id')
    .single()
  return data?.id
}

function questionText(question: GuestQuestion, state: WorkState, show: ShowForGuestList): string {
  switch (question) {
    case 'name':
      return `${show.venue_name ?? 'The show'}, ${formatShowDate(show.date)}. Who is it? First and last name.`
    case 'email':
      return 'Their email, so we can tell them directly. Send "skip" if you do not have it.'
    case 'tickets':
      return `How many, including ${state.firstName ?? 'them'}?`
    case 'pass':
      return 'Which pass? Reply ticket, guest laminate, AAA, photo pass, aftershow or other.'
  }
}
