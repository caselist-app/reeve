'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { personSchema, crewDetailSchema } from '@/lib/validators/person'
import { bustTourContextCache } from '@/lib/ai/context'
import type { z } from 'zod'

export type PeopleActionState = { error: string | null; personId?: string }

// Maps the form DTO's identity fields to a contacts row. Empty strings become
// null so DB constraints (and the date column) are satisfied.
function contactIdentityFields(p: z.infer<typeof personSchema>) {
  return {
    name: p.name,
    contact_email: p.contact_email || null,
    contact_phone: p.contact_phone || null,
    preferred_channel: p.preferred_channel ?? 'whatsapp',
    whatsapp_number: p.whatsapp_number || null,
    sms_number: p.sms_number || null,
    emergency_contact_name: p.emergency_contact_name || null,
    emergency_contact_phone: p.emergency_contact_phone || null,
    dietary: p.dietary || null,
    allergies: p.allergies || null,
    home_city: p.home_city || null,
    passport_first_names: p.passport_first_names || null,
    passport_surname: p.passport_surname || null,
    passport_number: p.passport_number || null,
    passport_expiry: p.passport_expiry || null,
    passport_country: p.passport_country || null,
    date_of_birth: p.date_of_birth || null,
    tshirt_size: p.tshirt_size || null,
  }
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
    .insert({
      account_id: user.id,
      ...contactIdentityFields(p),
      default_person_type: p.person_type,
      default_role: p.role || null,
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
      role: p.role || null,
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

  return { error: null, personId: person.id }
}

export async function updatePerson(
  personId: string,
  data: z.infer<typeof personSchema>,
  crewDetail?: z.infer<typeof crewDetailSchema>
): Promise<PeopleActionState> {
  await requireUser()

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

  // RLS on people enforces owns_tour(tour_id), so this returns null if the caller
  // does not own the person's tour. This is the ownership check.
  const { data: existing } = await supabase
    .from('people')
    .select('tour_id, contact_id')
    .eq('id', personId)
    .single()

  if (!existing) {
    return { error: 'Person not found.' }
  }

  // 1. Identity -> the contact. This updates the person everywhere they appear:
  // the contact is the single source of truth.
  const { error: contactError } = await supabase
    .from('contacts')
    .update(contactIdentityFields(p))
    .eq('id', existing.contact_id)

  if (contactError) {
    if (contactError.code === '23505') {
      return await whatsappConflictError(
        supabase,
        existing.tour_id,
        p.whatsapp_number,
        personId
      )
    }
    return { error: contactError.message }
  }

  // 2. Membership terms -> people.
  const { error: personError } = await supabase
    .from('people')
    .update({ person_type: p.person_type, role: p.role || null })
    .eq('id', personId)

  if (personError) {
    return { error: personError.message }
  }

  // 3. Per-tour rates.
  if (detail) {
    const { error: detailError } = await supabase.from('crew_detail').upsert({
      person_id: personId,
      tour_id: existing.tour_id,
      ...detail,
    })

    if (detailError) {
      return { error: 'Could not save pay details. Please try again.' }
    }
  }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/people`)

  return { error: null }
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
    .update({ person_type: personType, role: role || null })
    .eq('id', personId)

  if (personError) {
    return { error: personError.message }
  }

  if (personType === 'crew' && crewDetail) {
    const parsed = crewDetailSchema.safeParse(crewDetail)
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message }
    }
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

  return { error: null }
}

// Looks up the name of the person who already holds a WhatsApp number on this tour
// so the error message can name them. The number lives on the contact, so this
// joins people -> contacts. excludePersonId is set on updates to skip the person
// being edited.
async function whatsappConflictError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tourId: string,
  number: string | undefined,
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
