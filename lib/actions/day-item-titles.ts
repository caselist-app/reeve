'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

// Remembered custom titles for the typed day form (REE-22). A TM who added an
// 'After show' once should see it offered the next time they type, so a repeated
// custom item does not become five subtly different spellings.
//
// `select distinct title where kind = 'other'`, scoped to the tour. RLS already
// restricts day_items to tours the caller owns; the explicit tour_id filter
// scopes within that. Reads fail soft to an empty list: the remembered titles
// are a convenience, and a failed fetch must never block typing a new one.
export async function getCustomDayItemTitles(tourId: string): Promise<string[]> {
  await requireUser()

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('day_items')
    .select('title')
    .eq('tour_id', tourId)
    .eq('kind', 'other')
    .not('title', 'is', null)
    .order('title', { ascending: true })

  if (error || !data) return []

  // Distinct, case-insensitively, keeping the first spelling seen. PostgREST has
  // no DISTINCT, so it is deduplicated here rather than in the query.
  const seen = new Set<string>()
  const titles: string[] = []
  for (const row of data) {
    const title = row.title?.trim()
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    titles.push(title)
  }

  return titles
}
