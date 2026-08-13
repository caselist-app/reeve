'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { definedOnly } from '@/lib/forms/write-row'
import { personSchema, crewDetailSchema } from '@/lib/validators/person'
import { bustTourContextCache } from '@/lib/ai/context'
import type { PartyPickerPerson } from '@/lib/party/presets'
import type { z } from 'zod'

export type PeopleActionState = { error: string | null; personId?: string }

// REE-169: the one client-callable roster fetch in PartyPickerPerson shape.
// lib/party/resolve.ts and lib/schedule/day-roster.ts answer "who is already
// attached to this record"; this answers "who is on the tour at all", which
// is what the party picker's 'everyone'/'artist'/'crew' presets resolve
// against, so every add-to-day form (a client component) needs it on open.
export async function getTourRoster(
  tourId: string
): Promise<{ error: string | null; people: PartyPickerPerson[] }> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.', people: [] }

  const { data, error } = await supabase
    .from('people')
    .select('id, person_type, contacts(name)')
    .eq('tour_id', tourId)

  if (error) return { error: error.message, people: [] }

  const people: PartyPickerPerson[] = (data ?? []).map((row) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts
    return { id: row.id, person_type: row.person_type, name: contact?.name ?? '' }
  })

  return { error: null, people }
}

// Maps the form DTO's identity fields to a contacts row, on the same rule as
// toRow in lib/actions/contacts.ts: undefined is dropped, null is written.
//
// `notes` belongs here and was missing, which is the third of Brief 37's
// destructive instances and the one with no wipe involved. contact-sheet.tsx
// posts a notes textarea on the add path, personSchema did not declare the key,
// Zod stripped it, and this mapper had nowhere to read it from. The TM typed a
// note, saved, and it was gone, while the same textarea saved fine the next
// time they opened the person. Any field added to one of these two mappers has
// to be added to the other and to both schemas, or it silently does nothing.
function contactIdentityFields(p: z.infer<typeof personSchema>) {
  return definedOnly({
    contact_email: p.contact_email,
    contact_phone: p.contact_phone,
    operational_channel: p.operational_channel,
    email_enabled: p.email_enabled,
    whatsapp_number: p.whatsapp_number,
    sms_number: p.sms_number,
    emergency_contact_name: p.emergency_contact_name,
    emergency_contact_phone: p.emergency_contact_phone,
    dietary: p.dietary,
    allergies: p.allergies,
    home_city: p.home_city,
    passport_first_names: p.passport_first_names,
    passport_surname: p.passport_surname,
    passport_number: p.passport_number,
    passport_expiry: p.passport_expiry,
    passport_country: p.passport_country,
    date_of_birth: p.date_of_birth,
    tshirt_size: p.tshirt_size,
    notes: p.notes,
  })
}

export async function addPerson(
  tourId: string,
  data: z.infer<typeof personSchema>,
  crewDetail?: z.infer<typeof crewDetailSchema>
): Promise<PeopleActionState> {
  const user = await requireUser()

  const parsedPerson = personSchema.safeParse(data)
  if (!parsedPerson.success) {
    return { error: parsedPerson.error.issues[0].message }
  }
  const p = parsedPerson.data

  let detail: z.infer<typeof crewDetailSchema> | undefined
  if (p.person_type === 'crew' && crewDetail) {
    const parsedDetail = crewDetailSchema.safeParse(crewDetail)
    if (!parsedDetail.success) {
      return { error: parsedDetail.error.issues[0].message }
    }
    detail = parsedDetail.data
  }

  const supabase = await createClient()

  // Verify tour ownership before inserting. RLS would also block it, but
  // checking upfront gives a clear user-facing error instead of a DB privilege error.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) {
    return { error: 'Tour not found.' }
  }

  // 1. Identity -> a new contact (single source of truth). Its defaults seed the
  // per-tour terms for any future tour this contact is added to.
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    // This is an insert of a brand new contact, so `?? null` is safe here in a
    // way it never is on an update: there is no stored value to destroy, and
    // the seeded defaults are genuinely absent when the TM did not give them.
    // `name` is stated outside contactIdentityFields because that mapper
    // returns a Partial and the column is not null.
    .insert({
      account_id: user.id,
      ...contactIdentityFields(p),
      name: p.name,
      default_person_type: p.person_type,
      default_role: p.role ?? null,
      default_per_diem_rate: detail?.per_diem_rate ?? null,
      default_per_diem_currency: detail?.per_diem_currency ?? null,
      default_daily_wage_rate: detail?.daily_wage_rate ?? null,
      default_wage_currency: detail?.wage_currency ?? null,
    })
    .select('id')
    .single()

  if (contactError || !contact) {
    return { error: contactError?.message ?? 'Could not save contact.' }
  }

  // 2. Membership -> people. The per-tour WhatsApp uniqueness trigger raises
  // 23505 if another person on this tour already holds the number.
  const { data: person, error: personError } = await supabase
    .from('people')
    .insert({
      tour_id: tourId,
      contact_id: contact.id,
      person_type: p.person_type,
      role: p.role ?? null,
    })
    .select('id')
    .single()

  if (personError || !person) {
    // Roll back the contact we just created so we do not orphan it.
    await supabase.from('contacts').delete().eq('id', contact.id)
    if (personError?.code === '23505') {
      return await whatsappConflictError(supabase, tourId, p.whatsapp_number)
    }
    return { error: personError?.message ?? 'Could not add person.' }
  }

  // 3. Per-tour rates.
  if (detail) {
    const { error: detailError } = await supabase.from('crew_detail').insert({
      person_id: person.id,
      tour_id: tourId,
      ...detail,
    })

    if (detailError) {
      await supabase.from('people').delete().eq('id', person.id)
      await supabase.from('contacts').delete().eq('id', contact.id)
      return { error: 'Could not save pay details. Please try again.' }
    }
  }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/people`)
  // The day view's roster panel renders the same membership rows as the people
  // page, so a person added from either surface has to invalidate both.
  revalidatePath(`/tours/${tourId}/schedule`)

  return { error: null, personId: person.id }
}

// updatePerson was here. It had no callers anywhere in the repo: contact-sheet.tsx,
// the only edit surface for a person, calls updateContact and updatePersonTerms
// in parallel instead, because identity is account-level and terms are
// tour-level and the two writes have different scopes. Deleted rather than
// given the revalidate it was missing, since a second untested way to write
// contacts, people and crew_detail is a place for the two to drift apart, and
// the null-versus-undefined rules above would have had to be maintained in both.

// Adds an existing roster contact to a tour via the add_contact_to_tour RPC.
// personType overrides the contact's default_person_type (e.g. when the TM
// clicked "Add Crew" specifically). The RPC seeds per-tour rates from the
// contact's defaults and enforces ownership of both the tour and the contact.
export async function addContactToTour(
  tourId: string,
  contactId: string,
  personType: string
): Promise<PeopleActionState> {
  await requireUser()

  const supabase = await createClient()

  const { data: personId, error } = await supabase.rpc('add_contact_to_tour', {
    p_tour_id: tourId,
    p_contact_id: contactId,
    p_person_type: personType,
    p_role: undefined,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'This person is already on the tour.' }
    }
    return { error: error.message }
  }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/people`)
  revalidatePath(`/tours/${tourId}/schedule`)

  return { error: null, personId: personId ?? undefined }
}

// Updates only the tour-membership fields (type, role, per-tour rates) for an
// existing person. Identity is handled separately by updateContact. Used when
// the ContactSheet is opened in tour-edit context from the people page.
export async function updatePersonTerms(
  personId: string,
  personType: string,
  role: string | null,
  crewDetail?: z.infer<typeof crewDetailSchema>
): Promise<PeopleActionState> {
  await requireUser()

  const supabase = await createClient()

  // RLS on people enforces owns_tour(tour_id), so this returns null if the
  // caller does not own the person's tour.
  const { data: existing } = await supabase
    .from('people')
    .select('tour_id')
    .eq('id', personId)
    .single()

  if (!existing) {
    return { error: 'Person not found.' }
  }

  const { error: personError } = await supabase
    .from('people')
    .update({ person_type: personType, role })
    .eq('id', personId)

  if (personError) {
    return { error: personError.message }
  }

  if (personType === 'crew' && crewDetail) {
    const parsed = crewDetailSchema.safeParse(crewDetail)
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message }
    }
    // The upsert payload is the convention in miniature. supabase-js JSON
    // serialises this object, so a rate key holding undefined is not sent and
    // the stored rate survives, while a key holding null is sent and clears the
    // column. Before crewDetailSchema was made nullable, a blank rate input
    // could only ever produce undefined, so a per diem could be set and never
    // taken off again. definedOnly is not needed here: JSON.stringify already
    // does the dropping, and spelling it out would imply the two behave
    // differently.
    const { error: detailError } = await supabase.from('crew_detail').upsert({
      person_id: personId,
      tour_id: existing.tour_id,
      ...parsed.data,
    })
    if (detailError) {
      return { error: 'Could not save pay details. Please try again.' }
    }
  }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/people`)
  // person_type and role both render in the day view's roster panel.
  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return { error: null }
}

export async function removePerson(personId: string): Promise<PeopleActionState> {
  await requireUser()

  const supabase = await createClient()

  // RLS on people enforces owns_tour(tour_id) - returns null if caller does not own the tour.
  const { data: person } = await supabase
    .from('people')
    .select('tour_id')
    .eq('id', personId)
    .single()

  if (!person) {
    return { error: 'Person not found.' }
  }

  // Check all blocking constraints before attempting deletion.
  // transport_assignments and room_assignments cascade-delete, so they block
  // deletion at the app level (not the DB level) for a user-friendly message.
  // document_shares and notification_log are now ON DELETE RESTRICT: the DB
  // blocks deletion directly. Surface a clear message for those cases too.
  const [
    { count: transportCount },
    { count: roomCount },
    { count: shareCount },
    { count: notifCount },
  ] = await Promise.all([
    supabase.from('transport_assignments').select('id', { count: 'exact', head: true }).eq('person_id', personId),
    supabase.from('room_assignments').select('id', { count: 'exact', head: true }).eq('person_id', personId),
    supabase.from('document_shares').select('id', { count: 'exact', head: true }).eq('recipient_person_id', personId),
    supabase.from('notification_log').select('id', { count: 'exact', head: true }).eq('person_id', personId),
  ])

  if ((transportCount ?? 0) > 0 || (roomCount ?? 0) > 0) {
    return { error: "Remove this person's travel and hotel assignments first." }
  }

  if ((shareCount ?? 0) > 0) {
    return { error: 'This person has a document delivery history that must be kept. Archive the tour instead of removing them.' }
  }

  if ((notifCount ?? 0) > 0) {
    return { error: 'This person has a notification history that must be kept. Archive the tour instead of removing them.' }
  }

  // Deletes the tour membership only. The contact stays in the roster.
  const { error } = await supabase.from('people').delete().eq('id', personId)

  if (error) {
    return { error: error.message }
  }

  void bustTourContextCache(person.tour_id)
  revalidatePath(`/tours/${person.tour_id}/people`)
  // The most visible of the four in the day roster: someone the TM removed
  // stays listed on the day until a hard reload without this.
  revalidatePath(`/tours/${person.tour_id}/schedule`)

  return { error: null }
}

// Looks up the name of the person who already holds a WhatsApp number on this tour
// so the error message can name them. The number lives on the contact, so this
// joins people -> contacts. excludePersonId is set on updates to skip the person
// being edited.
async function whatsappConflictError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tourId: string,
  number: string | null | undefined,
  excludePersonId?: string
): Promise<PeopleActionState> {
  if (!number) {
    return { error: 'This WhatsApp number is already in use on this tour.' }
  }

  const { data: rows } = await supabase
    .from('people')
    .select('id, contacts!inner(name)')
    .eq('tour_id', tourId)
    .eq('contacts.whatsapp_number', number)

  const conflict = (rows ?? []).find((r) => r.id !== excludePersonId)

  if (conflict) {
    return { error: `This number is already assigned to ${conflict.contacts.name} on this tour.` }
  }

  return { error: 'This WhatsApp number is already in use on this tour.' }
}
