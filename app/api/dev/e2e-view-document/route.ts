import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDocumentViewUrl } from '@/lib/actions/documents'

// Exercises getDocumentViewUrl from a real request, so
// tests/e2e/access.spec.ts (REE-302) can prove account isolation through the
// caller's real session cookies. setup.ts mocks createClient to a
// service-role client in tests/integration, so RLS is never enforced there;
// this route is the only way to reach the action from a real, RLS-scoped
// session, the same reason e2e-sign-identity-document exists for
// signIdentityDocumentUrl.
//
// POST /api/dev/e2e-view-document
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

  const result = await getDocumentViewUrl(documentId)
  return NextResponse.json(result)
}
