import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { signIdentityDocumentUrl } from '@/lib/actions/identity-documents'

// Exercises signIdentityDocumentUrl from a real request, so
// tests/e2e/access.spec.ts (REE-202) can prove account isolation through the
// caller's real session cookies rather than importing the action and losing
// the request context requireUser() depends on. "View scan" has no UI
// trigger yet (Brief 45 left the [...] menu for a later slice), so this is
// the only way to reach the action from Playwright, the same reason
// e2e-login exists for signing in.
//
// POST /api/dev/e2e-sign-identity-document
// Headers: x-e2e-secret: <E2E_LOGIN_SECRET>
// Body (JSON): { documentId }
//
// Same two guards as e2e-login, load bearing for the same reason: no
// E2E_LOGIN_SECRET in the environment, no route, and a request presenting
// the wrong secret gets nothing back.
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

  const documentId = typeof body.documentId === 'string' ? body.documentId : null
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
  }

  const result = await signIdentityDocumentUrl(documentId)
  return NextResponse.json(result)
}
