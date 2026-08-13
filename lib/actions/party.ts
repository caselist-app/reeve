'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { resolveParty, type PartyEntity } from '@/lib/party/resolve'

// Read side for the edit panels' party field (REE-226): who is already
// attached to a segment or stay, for a caller that only has the entity id,
// not a snapshot of its assignments. resolveParty itself takes no auth
// context, so this is the ownership-checked wrapper client components call.
export async function getEntityParty(
  tourId: string,
  entity: PartyEntity,
): Promise<{ error: string | null; personIds: string[] }> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.', personIds: [] }

  const result = await resolveParty(supabase, tourId, entity)
  if (result.error) return { error: result.error, personIds: [] }

  return { error: null, personIds: result.people.map((p) => p.id) }
}
