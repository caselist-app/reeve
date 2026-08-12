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

/** One document_shares row, shaped for the card's share log. */
export interface DocumentShareRow {
  id: string
  document_id: string
  recipient_name: string
  recipient_role: string | null
  recipient_email: string | null
  show_id: string | null
  show_label: string | null
  sent_at: string | null
  opened_at: string | null
  acknowledged_at: string | null
  reminder_count: number
}

export interface DocumentsPageData {
  // null when the tour does not exist or is not owned by this account, so the
  // page can redirect the same way every other tour-scoped page does.
  tour: TourHeader | null
  documents: DocumentRow[]
  // Every document's shares, keyed by document_id, fetched once for the whole
  // tour rather than once per document: a card-per-document loop calling this
  // per card would be the classic N+1, and a tour's share history is a handful
  // of rows either way.
  shares: Record<string, DocumentShareRow[]>
  // A failed read must never render as an empty result (CLAUDE.md): "no
  // documents yet" and "the query broke" look identical from the outside, so
  // the page needs this to tell them apart rather than a confident, wrong
  // empty state.
  error: string | null
  // Separate from `error`: the documents themselves can load fine while the
  // share log fails, and collapsing the two would show every card's log as
  // "Not yet sent." instead of surfacing the failed read.
  sharesError: string | null
}

// All three fetches run in one Promise.all: the tour (header eyebrow and
// ownership check), the current documents, and every share ever sent for
// them. None depends on another's result.
export async function fetchDocumentsPage(
  supabase: Client,
  tourId: string,
  accountId: string
): Promise<DocumentsPageData> {
  const [tourResult, documentsResult, sharesResult] = await Promise.all([
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
    // The recipient's name lives on contacts, not people: a two-hop embed.
    // people(name) does not exist (Brief 20 moved identity onto contacts) and
    // PostgREST rejects the select outright, which used to be the exact bug
    // this page would have shipped.
    supabase
      .from('document_shares')
      .select(
        'id, document_id, show_id, sent_at, opened_at, acknowledged_at, reminder_count, people(role, contacts(name, contact_email)), shows(venue_name)'
      )
      .eq('tour_id', tourId)
      .order('created_at', { ascending: true }),
  ])

  const tour = tourResult.data
    ? {
        id: tourResult.data.id,
        name: tourResult.data.name,
        artist_name: (tourResult.data.artists as { name: string } | null)?.name ?? null,
      }
    : null

  if (documentsResult.error) {
    return { tour, documents: [], shares: {}, error: 'Could not load documents.', sharesError: null }
  }

  const shares: Record<string, DocumentShareRow[]> = {}
  if (sharesResult.error) {
    console.error('[fetchDocumentsPage] share read failed:', sharesResult.error.message)
  } else {
    for (const row of sharesResult.data ?? []) {
      const person = row.people as {
        role: string | null
        contacts: { name: string; contact_email: string | null } | null
      } | null
      const show = row.shows as { venue_name: string } | null
      const bucket = shares[row.document_id] ?? []
      bucket.push({
        id: row.id,
        document_id: row.document_id,
        recipient_name: person?.contacts?.name ?? 'Unknown',
        recipient_role: person?.role ?? null,
        recipient_email: person?.contacts?.contact_email ?? null,
        show_id: row.show_id,
        show_label: show?.venue_name ?? null,
        sent_at: row.sent_at,
        opened_at: row.opened_at,
        acknowledged_at: row.acknowledged_at,
        reminder_count: row.reminder_count,
      })
      shares[row.document_id] = bucket
    }
  }

  return {
    tour,
    documents: documentsResult.data ?? [],
    shares,
    error: null,
    sharesError: sharesResult.error ? 'Could not load share activity.' : null,
  }
}
