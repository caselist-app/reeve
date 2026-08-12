import type { createClient } from '@/lib/supabase/server'

type Client = Awaited<ReturnType<typeof createClient>>

export interface DocumentRow {
  id: string
  title: string
  doc_type: string
  created_at: string
}

export interface TourHeader {
  id: string
  name: string
  artist_name: string | null
}

export interface DocumentsPageData {
  // null when the tour does not exist or is not owned by this account, so the
  // page can redirect the same way every other tour-scoped page does.
  tour: TourHeader | null
  documents: DocumentRow[]
  // A failed read must never render as an empty result (CLAUDE.md): "no
  // documents yet" and "the query broke" look identical from the outside, so
  // the page needs this to tell them apart rather than a confident, wrong
  // empty state.
  error: string | null
}

// Both fetches run in one Promise.all: the tour (for the header eyebrow and
// the ownership check) and the current documents for the tour. Neither
// depends on the other's result.
export async function fetchDocumentsPage(
  supabase: Client,
  tourId: string,
  accountId: string
): Promise<DocumentsPageData> {
  const [tourResult, documentsResult] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, artists(name)')
      .eq('id', tourId)
      .eq('account_id', accountId)
      .single(),
    supabase
      .from('documents')
      .select('id, title, doc_type, created_at')
      .eq('tour_id', tourId)
      .eq('is_current', true)
      .order('created_at', { ascending: false }),
  ])

  const tour = tourResult.data
    ? {
        id: tourResult.data.id,
        name: tourResult.data.name,
        artist_name: (tourResult.data.artists as { name: string } | null)?.name ?? null,
      }
    : null

  if (documentsResult.error) {
    return { tour, documents: [], error: 'Could not load documents.' }
  }

  return { tour, documents: documentsResult.data ?? [], error: null }
}
