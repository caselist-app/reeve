import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// contact_artists (REE-233 / Brief 29 step 1) has no reading page or writing
// action yet: the roster filter and the contact-sheet artist picker are later
// steps of the same brief. So there is nothing to sign a real request into the
// way e2e-sign-identity-document wraps signIdentityDocumentUrl. This route
// exists purely so tests/e2e/access.spec.ts can run a real, RLS-scoped select
// or insert against contact_artists from a real cookie-carrying session, the
// same reason e2e-login exists with no production analogue of its own.
//
// POST /api/dev/e2e-contact-artists
// Headers: x-e2e-secret: <E2E_LOGIN_SECRET>
// Body (JSON): { op: 'select' | 'insert', contactId, artistId }
//
// Same two guards as e2e-login and e2e-sign-identity-document, load bearing
// for the same reason: no E2E_LOGIN_SECRET in the environment, no route.
export async function POST(request: NextRequest) {
  const secret = process.env.E2E_LOGIN_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const presented = request.headers.get('x-e2e-secret')
  if (!presented) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (presented !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const op = body.op === 'insert' ? 'insert' : body.op === 'select' ? 'select' : null
  const contactId = typeof body.contactId === 'string' ? body.contactId : null
  const artistId = typeof body.artistId === 'string' ? body.artistId : null
  if (!op || !contactId || !artistId) {
    return NextResponse.json({ error: 'op, contactId and artistId are required' }, { status: 400 })
  }

  const supabase = await createClient()

  if (op === 'select') {
    const { data, error } = await supabase
      .from('contact_artists')
      .select('contact_id, artist_id')
      .eq('contact_id', contactId)
      .eq('artist_id', artistId)

    return NextResponse.json({ rows: data ?? [], error: error?.message ?? null })
  }

  const { error } = await supabase
    .from('contact_artists')
    .insert({ contact_id: contactId, artist_id: artistId })

  return NextResponse.json({ error: error?.message ?? null })
}
