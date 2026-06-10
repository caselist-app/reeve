'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { personSchema, crewDetailSchema } from '@/lib/validators/person'
import { bustTourContextCache } from '@/lib/ai/context'
import type { z } from 'zod'

export type PeopleActionState = { error: string | null; personId?: string }

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

  const { data: person, error: personError } = await supabase
    .from('people')
    .insert({
      tour_id: tourId,
      ...parsedPerson.data,
      // Coerce empty strings to null so DB constraints are satisfied.
      contact_email: parsedPerson.data.contact_email || null,
      whatsapp_number: parsedPerson.data.whatsapp_number || null,
    })
    .select('id')
    .single()

  if (personError) {
    if (personError.code === '23505') {
      return await whatsappConflictError(supabase, tourId, parsedPerson.data.whatsapp_number)
    }
    return { error: personError.message }
  }

  if (parsedPerson.data.person_type === 'crew' && crewDetail) {
    const parsedDetail = crewDetailSchema.safeParse(crewDetail)
    if (!parsedDetail.success) {
      // Roll back: remove the person row so we do not leave an orphan.
      await supabase.from('people').delete().eq('id', person.id)
      return { error: parsedDetail.error.issues[0].message }
    }

    const { error: detailError } = await supabase.from('crew_detail').insert({
      person_id: person.id,
      tour_id: tourId,
      ...parsedDetail.data,
    })

    if (detailError) {
      await supabase.from('people').delete().eq('id', person.id)
      return { error: 'Could not save pay details. Please try again.' }
    }
  }

  void bustTourContextCache(tourId)

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

  const supabase = await createClient()

  // RLS on people enforces owns_tour(tour_id), so this returns null if the caller
  // does not own the person's tour. This is the ownership check.
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
    .update({
      ...parsedPerson.data,
      contact_email: parsedPerson.data.contact_email || null,
      whatsapp_number: parsedPerson.data.whatsapp_number || null,
    })
    .eq('id', personId)

  if (personError) {
    if (personError.code === '23505') {
      return await whatsappConflictError(
        supabase,
        existing.tour_id,
        parsedPerson.data.whatsapp_number,
        personId
      )
    }
    return { error: personError.message }
  }

  if (parsedPerson.data.person_type === 'crew' && crewDetail) {
    const parsedDetail = crewDetailSchema.safeParse(crewDetail)
    if (!parsedDetail.success) {
      return { error: parsedDetail.error.issues[0].message }
    }

    const { error: detailError } = await supabase.from('crew_detail').upsert({
      person_id: personId,
      tour_id: existing.tour_id,
      ...parsedDetail.data,
    })

    if (detailError) {
      return { error: 'Could not save pay details. Please try again.' }
    }
  }

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

  // transport_assignments and room_assignments both ON DELETE CASCADE from person_id,
  // so the DB will not block deletion. Check here and surface a user-facing error.
  const [{ count: transportCount }, { count: roomCount }] = await Promise.all([
    supabase
      .from('transport_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('person_id', personId),
    supabase
      .from('room_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('person_id', personId),
  ])

  if ((transportCount ?? 0) > 0 || (roomCount ?? 0) > 0) {
    return { error: "Remove this person's travel and hotel assignments first." }
  }

  const { error } = await supabase.from('people').delete().eq('id', personId)

  if (error) {
    return { error: error.message }
  }

  void bustTourContextCache(person.tour_id)

  return { error: null }
}

// Looks up the name of the person who already holds a WhatsApp number on this tour
// so the error message can name them. excludePersonId is set on updates to avoid
// matching the person being edited.
async function whatsappConflictError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tourId: string,
  number: string | undefined,
  excludePersonId?: string
): Promise<PeopleActionState> {
  if (!number) {
    return { error: 'This WhatsApp number is already in use on this tour.' }
  }

  let query = supabase
    .from('people')
    .select('name')
    .eq('tour_id', tourId)
    .eq('whatsapp_number', number)

  if (excludePersonId) {
    query = query.neq('id', excludePersonId)
  }

  const { data: conflict } = await query.single()

  if (conflict) {
    return { error: `This number is already assigned to ${conflict.name} on this tour.` }
  }

  return { error: 'This WhatsApp number is already in use on this tour.' }
}
