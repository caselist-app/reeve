import type { createClient } from '@/lib/supabase/server'

type Client = Awaited<ReturnType<typeof createClient>>

export interface DocumentRow {
  id: string
  title: string
  doc_type: string
  version: number
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

/** A non-current documents row, for the card's "older versions" toggle. */
export interface OlderVersionRow {
  id: string
  title: string
  version: number
  created_at: string
  share_count: number
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
  // Non-current documents, keyed by doc_type, newest first. A card looks up
  // its own doc_type here for the "{n} older versions" toggle.
  olderVersions: Record<string, OlderVersionRow[]>
  // A failed read must never render as an empty result (CLAUDE.md): "no
  // documents yet" and "the query broke" look identical from the outside, so
  // the page needs this to tell them apart rather than a confident, wrong
  // empty state.
  error: string | null
  // Separate from `error`: the documents themselves can load fine while the
  // share log fails, and collapsing the two would show every card's log as
  // "Not yet sent." instead of surfacing the failed read.
  sharesError: string | null
  // Separate again: older versions can fail to load while the current
  // documents and their shares are fine.
  olderVersionsError: string | null
}

// All four fetches run in one Promise.all: the tour (header eyebrow and
// ownership check), the current documents, every share ever sent for them,
// and the non-current (older) documents. None depends on another's result.
export async function fetchDocumentsPage(
  supabase: Client,
  tourId: string,
  accountId: string
): Promise<DocumentsPageData> {
  const [tourResult, documentsResult, sharesResult, olderVersionsResult] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, artists(name)')
      .eq('id', tourId)
      .eq('account_id', accountId)
      .single(),
    supabase
      .from('documents')
      .select('id, title, doc_type, version, created_at')
      .eq('tour_id', tourId)
      .eq('is_current', true)
      .order('created_at', { ascending: false }),
    // The recipient's name lives on contacts, not people: a two-hop embed.
    // people(name) does not exist (Brief 20 moved identity onto contacts) and
    // PostgREST rejects the select outright, which used to be the exact bug
    // this page would have shipped.
    //
    // Scoped by document_id, not doc_type: every version, current or not,
    // has its own document row, so a share is only ever attached to the one
    // exact version it was sent against. Bucketing this by document_id below
    // is what keeps a card's main log to its current version's shares alone
    // even though this single query reads every share for the whole tour.
    supabase
      .from('document_shares')
      .select(
        'id, document_id, show_id, sent_at, opened_at, acknowledged_at, reminder_count, people(role, contacts(name, contact_email)), shows(venue_name)'
      )
      .eq('tour_id', tourId)
      .order('created_at', { ascending: true }),
    // is_current = false, explicitly, rather than "not in the current list":
    // a version-numbered row is only ever current or not, and asserting the
    // filter here is what a naive doc_type-only join (no is_current check at
    // all) would be missing, letting a stale row leak into the main list.
    supabase
      .from('documents')
      .select('id, title, doc_type, version, created_at')
      .eq('tour_id', tourId)
      .eq('is_current', false)
      .order('version', { ascending: false }),
  ])

  const tour = tourResult.data
    ? {
        id: tourResult.data.id,
        name: tourResult.data.name,
        artist_name: (tourResult.data.artists as { name: string } | null)?.name ?? null,
      }
    : null

  if (documentsResult.error) {
    return {
      tour,
      documents: [],
      shares: {},
      olderVersions: {},
      error: 'Could not load documents.',
      sharesError: null,
      olderVersionsError: null,
    }
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

  const olderVersions: Record<string, OlderVersionRow[]> = {}
  if (olderVersionsResult.error) {
    console.error('[fetchDocumentsPage] older versions read failed:', olderVersionsResult.error.message)
  } else {
    for (const row of olderVersionsResult.data ?? []) {
      const bucket = olderVersions[row.doc_type] ?? []
      bucket.push({
        id: row.id,
        title: row.title,
        version: row.version,
        created_at: row.created_at,
        // Looked up from the shares map above, keyed by this exact version's
        // document_id, never by doc_type: that is what keeps this count from
        // ever double-counting another version's shares.
        share_count: shares[row.id]?.length ?? 0,
      })
      olderVersions[row.doc_type] = bucket
    }
  }

  return {
    tour,
    documents: documentsResult.data ?? [],
    shares,
    olderVersions,
    error: null,
    sharesError: sharesResult.error ? 'Could not load share activity.' : null,
    olderVersionsError: olderVersionsResult.error ? 'Could not load older versions.' : null,
  }
}
