'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { contactSchema } from '@/lib/validators/contact'
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

export type ContactWithTours = {
  contact: Tables<'contacts'>
  tours: TourMembership[]
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

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('account_id', user.id)
    .single()

  if (!contact) return { data: null, error: 'Contact not found.' }

  const { data: memberships } = await supabase
    .from('people')
    .select('id, person_type, role, tour_id, tours(name, artists(name), status)')
    .eq('contact_id', contactId)

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

  return { data: { contact, tours }, error: null }
}

// Maps the contact form DTO to a contacts row. Empty strings become null so the
// date column and optional fields are satisfied.
function toRow(c: z.infer<typeof contactSchema>) {
  return {
    name: c.name,
    contact_email: c.contact_email || null,
    contact_phone: c.contact_phone || null,
    preferred_channel: c.preferred_channel ?? 'whatsapp',
    whatsapp_number: c.whatsapp_number || null,
    sms_number: c.sms_number || null,
    emergency_contact_name: c.emergency_contact_name || null,
    emergency_contact_phone: c.emergency_contact_phone || null,
    dietary: c.dietary || null,
    allergies: c.allergies || null,
    home_city: c.home_city || null,
    passport_number: c.passport_number || null,
    passport_expiry: c.passport_expiry || null,
    passport_country: c.passport_country || null,
    passport_first_names: c.passport_first_names || null,
    passport_surname: c.passport_surname || null,
    date_of_birth: c.date_of_birth || null,
    tshirt_size: c.tshirt_size || null,
    default_person_type: c.default_person_type ?? 'crew',
    default_role: c.default_role || null,
    default_per_diem_rate: c.default_per_diem_rate ?? null,
    default_per_diem_currency: c.default_per_diem_currency || null,
    default_daily_wage_rate: c.default_daily_wage_rate ?? null,
    default_wage_currency: c.default_wage_currency || null,
    notes: c.notes || null,
  }
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

  const { data: row, error } = await supabase
    .from('contacts')
    .insert({ account_id: user.id, ...toRow(parsed.data) })
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

  return { error: null, contactId }
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
