'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { definedOnly } from '@/lib/forms/write-row'
import { contactSchema } from '@/lib/validators/contact'
import { sortIdentityDocuments } from '@/lib/identity/kinds'
import type { Tables } from '@/lib/types/database'
import type { z } from 'zod'

export type ContactActionState = { error: string | null; contactId?: string }

export type TourMembership = {
  personId: string
  tourId: string
  tourName: string
  artistAct: string
  status: string
  role: string | null
  personType: string
}

export type ContactArtist = { id: string; name: string }

export type ContactWithTours = {
  contact: Tables<'contacts'>
  tours: TourMembership[]
  identityDocuments: Tables<'identity_documents'>[]
  artists: ContactArtist[]
}

// Returns roster contacts that are not yet on the given tour, ordered by name.
// Used to populate the add-person picker on the people page.
export async function getAvailableContacts(
  tourId: string
): Promise<{ data: Pick<Tables<'contacts'>, 'id' | 'name' | 'default_role' | 'default_person_type'>[] | null; error: string | null }> {
  const user = await requireUser()
  const supabase = await createClient()

  // Fetch the contact IDs already on this tour so we can exclude them.
  const { data: existing } = await supabase
    .from('people')
    .select('contact_id')
    .eq('tour_id', tourId)

  const existingIds = (existing ?? []).map((r) => r.contact_id)

  let query = supabase
    .from('contacts')
    .select('id, name, default_role, default_person_type')
    .eq('account_id', user.id)
    .order('name')

  // Supabase .not('id', 'in', ...) requires a non-empty array.
  if (existingIds.length > 0) {
    query = query.not('id', 'in', `(${existingIds.join(',')})`)
  }

  const { data, error } = await query

  if (error) return { data: null, error: error.message }
  return { data: data ?? [], error: null }
}

export async function getContact(
  contactId: string
): Promise<{ data: ContactWithTours | null; error: string | null }> {
  const user = await requireUser()
  const supabase = await createClient()

  // None of these four depend on each other's result, only on contactId.
  const [{ data: contact }, { data: memberships }, { data: documents }, { data: artistLinks }] =
    await Promise.all([
      supabase.from('contacts').select('*').eq('id', contactId).eq('account_id', user.id).single(),
      supabase
        .from('people')
        .select('id, person_type, role, tour_id, tours(name, artists(name), status)')
        .eq('contact_id', contactId),
      supabase.from('identity_documents').select('*').eq('contact_id', contactId),
      supabase.from('contact_artists').select('artists(id, name)').eq('contact_id', contactId),
    ])

  if (!contact) return { data: null, error: 'Contact not found.' }

  const tours: TourMembership[] = (memberships ?? []).map((m) => {
    const t = m.tours as { name: string; artists: { name: string } | null; status: string } | null
    return {
      personId: m.id,
      tourId: m.tour_id,
      tourName: t?.name ?? 'Untitled tour',
      artistAct: t?.artists?.name ?? '',
      status: t?.status ?? '',
      role: m.role,
      personType: m.person_type,
    }
  })

  const identityDocuments = sortIdentityDocuments(documents ?? [])

  const artists: ContactArtist[] = (artistLinks ?? [])
    .map((l) => l.artists as ContactArtist | null)
    .filter((a): a is ContactArtist => a !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  return { data: { contact, tours, identityDocuments, artists }, error: null }
}

// The account's full artist list, plus which of them the given contact is
// currently linked to. Powers the roster-only Artists checklist on
// ContactSheet: contactId is null while creating a contact (nothing is
// checked yet) and the id being edited otherwise. One call serves both, so
// the sheet does not need a second round trip once it already knows the
// contact id.
export async function getContactArtistOptions(
  contactId: string | null
): Promise<{ data: { options: ContactArtist[]; selectedIds: string[] } | null; error: string | null }> {
  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: artists, error }, { data: links }] = await Promise.all([
    supabase.from('artists').select('id, name').eq('account_id', user.id).order('name'),
    contactId
      ? supabase.from('contact_artists').select('artist_id').eq('contact_id', contactId)
      : Promise.resolve({ data: [] as { artist_id: string }[], error: null }),
  ])

  if (error) return { data: null, error: error.message }

  return {
    data: { options: artists ?? [], selectedIds: (links ?? []).map((l) => l.artist_id) },
    error: null,
  }
}

// Replaces the full set of artists a contact is linked to. The roster-only
// Artists checklist always submits the whole current selection, not a diff,
// so this deletes and reinserts rather than reconciling row by row (the same
// shape the brief for this ticket names explicitly).
//
// RLS scopes contact_artists by ownership of both the contact and the artist,
// but the admin/service-role path used in tests bypasses RLS, so the
// ownership checks below are the actual enforcement there, not a belt and
// braces duplicate of it. Verifying both ids belong to the caller before
// writing is also the general rule (CLAUDE.md: an action taking more than one
// entity id must verify they belong together), not just a test-only concern.
export async function setContactArtists(
  contactId: string,
  artistIds: string[]
): Promise<{ error: string | null }> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', user.id)
    .single()

  if (!contact) {
    return { error: 'Contact not found.' }
  }

  if (artistIds.length > 0) {
    const { data: owned } = await supabase
      .from('artists')
      .select('id')
      .eq('account_id', user.id)
      .in('id', artistIds)

    if ((owned ?? []).length !== artistIds.length) {
      return { error: 'One or more artists were not found.' }
    }
  }

  const { error: deleteError } = await supabase
    .from('contact_artists')
    .delete()
    .eq('contact_id', contactId)

  if (deleteError) {
    return { error: deleteError.message }
  }

  if (artistIds.length === 0) {
    return { error: null }
  }

  const { error: insertError } = await supabase
    .from('contact_artists')
    .insert(artistIds.map((artistId) => ({ contact_id: contactId, artist_id: artistId })))

  if (insertError) {
    return { error: insertError.message }
  }

  return { error: null }
}

// Maps the contact form DTO to a contacts row.
//
// Every field goes through definedOnly, not just the ones that have already
// bitten. The rule is uniform because the failure is not: which fields a given
// save omits depends on which branch of contact-sheet.tsx rendered the form,
// and the next branch added will omit a different set. Two rounds of this bug
// were fixed field by field (the four default_* pay columns, then default_role
// and default_person_type) before it was worth saying that any field can be
// absent and none of them may be invented.
//
// So: undefined is dropped and the stored value survives, null is written and
// the column is cleared. No `?? null` and no `?? 'crew'` anywhere in here.
// Those two idioms are what turned "the panel had no input for this" into "the
// TM cleared this" on every save.
function toRow(c: z.infer<typeof contactSchema>) {
  return definedOnly({
    name: c.name,
    contact_email: c.contact_email,
    contact_phone: c.contact_phone,
    operational_channel: c.operational_channel,
    email_enabled: c.email_enabled,
    whatsapp_number: c.whatsapp_number,
    sms_number: c.sms_number,
    emergency_contact_name: c.emergency_contact_name,
    emergency_contact_phone: c.emergency_contact_phone,
    dietary: c.dietary,
    allergies: c.allergies,
    home_city: c.home_city,
    passport_number: c.passport_number,
    passport_expiry: c.passport_expiry,
    passport_country: c.passport_country,
    passport_first_names: c.passport_first_names,
    passport_surname: c.passport_surname,
    date_of_birth: c.date_of_birth,
    tshirt_size: c.tshirt_size,
    default_person_type: c.default_person_type,
    default_role: c.default_role,
    default_per_diem_rate: c.default_per_diem_rate,
    default_per_diem_currency: c.default_per_diem_currency,
    default_daily_wage_rate: c.default_daily_wage_rate,
    default_wage_currency: c.default_wage_currency,
    notes: c.notes,
  })
}

export async function createContact(
  data: z.infer<typeof contactSchema>
): Promise<ContactActionState> {
  const user = await requireUser()

  const parsed = contactSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // name after the spread: toRow returns a Partial (every key it holds can be
  // absent by design), and the column is not null, so the required field is
  // stated here rather than asserted away with a cast.
  const { data: row, error } = await supabase
    .from('contacts')
    .insert({ account_id: user.id, ...toRow(parsed.data), name: parsed.data.name })
    .select('id')
    .single()

  if (error || !row) {
    return { error: error?.message ?? 'Could not create contact.' }
  }

  return { error: null, contactId: row.id }
}

export async function updateContact(
  contactId: string,
  data: z.infer<typeof contactSchema>
): Promise<ContactActionState> {
  await requireUser()

  const parsed = contactSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // RLS scopes contacts by account_id = auth.uid(), so this only touches the
  // caller's own contact. Updating identity here changes the person on every
  // tour they are on: the contact is the single source of truth.
  const { error } = await supabase
    .from('contacts')
    .update(toRow(parsed.data))
    .eq('id', contactId)

  if (error) {
    // The per-tour WhatsApp uniqueness trigger raises 23505.
    if (error.code === '23505') {
      return { error: 'That WhatsApp number is already in use by someone on a shared tour.' }
    }
    return { error: error.message }
  }

  // A contact is account-level and renders on the day roster of every tour they
  // are on, so every one of those schedules is stale after a name change. The
  // form that calls this is the side panel on the people page, which refreshes
  // itself; the schedule route is the surface with no client-side path back to
  // it. Nothing here is a schedule redirect stub: /tours/{id}/schedule is the
  // route the day view actually renders from.
  const { data: memberships } = await supabase
    .from('people')
    .select('tour_id')
    .eq('contact_id', contactId)

  for (const tourId of new Set((memberships ?? []).map((m) => m.tour_id))) {
    revalidatePath(`/tours/${tourId}/schedule`)
  }

  return { error: null, contactId }
}

// Generates a one-time Telegram deep link for this contact. The TM shares it
// however suits; Reeve never sends it automatically. The webhook resolves
// the token back to this contact when they tap Start.
export async function createTelegramLinkToken(
  contactId: string
): Promise<{ error: string | null; deepLink?: string }> {
  const user = await requireUser()

  const supabase = await createClient()

  // RLS also enforces this on the insert below, but checking first gives a
  // clean error message instead of a silent RLS-denied no-op.
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', user.id)
    .single()

  if (!contact) {
    return { error: 'Contact not found.' }
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME
  if (!botUsername) {
    return { error: 'Telegram is not configured yet.' }
  }

  const { data: row, error } = await supabase
    .from('telegram_link_tokens')
    .insert({ contact_id: contactId, account_id: user.id })
    .select('token')
    .single()

  if (error || !row) {
    return { error: error?.message ?? 'Could not create a Telegram link.' }
  }

  return { error: null, deepLink: `https://t.me/${botUsername}?start=${row.token}` }
}

export async function deleteContact(contactId: string): Promise<ContactActionState> {
  await requireUser()

  const supabase = await createClient()

  // people.contact_id is ON DELETE RESTRICT, so a contact on any tour cannot be
  // deleted. Surface that as a clear message rather than a DB error.
  const { error } = await supabase.from('contacts').delete().eq('id', contactId)

  if (error) {
    if (error.code === '23503') {
      return { error: 'This contact is on a tour. Remove them from their tours first.' }
    }
    return { error: error.message }
  }

  return { error: null }
}
