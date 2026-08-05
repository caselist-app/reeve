import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Mints a session for a seeded test account, so the Playwright suite can open
// pages as a signed-in TM. This is the only thing it does.
//
// Reeve has no password login. app/(auth)/login/page.tsx is email OTP, which a
// test cannot drive: it needs the code out of an inbox, and requestOtpAction
// calls otpRatelimit.limit() unwrapped and by design, because that limiter is a
// security control against account enumeration and must fail loudly. CI has no
// Upstash, so driving the real form throws before a code is ever sent.
//
// POST /api/dev/e2e-login
// Headers: x-e2e-secret: <E2E_LOGIN_SECRET>
// Body (JSON): { email }
//
// Nothing here forges a cookie. generateLink produces a real token, verifyOtp
// redeems it on the normal @supabase/ssr server client, and that client writes
// the session cookies itself. Cookie names and chunking are internal to
// @supabase/ssr and have changed between versions, so hand-writing them would
// break silently on an upgrade.
//
// GUARDS. Both are load bearing and scripts/check-conventions.mjs Rule 9 fails
// the build if either is removed:
//
//   1. No E2E_LOGIN_SECRET in the environment, no route. It is set in the CI
//      job and nowhere else, which is what makes this endpoint non-existent in
//      production. Deliberately NOT guarded on NODE_ENV: the e2e job serves a
//      real production build with `next start`, so NODE_ENV is 'production'
//      there and that guard would 404 the route in the only place it works.
//   2. Wrong secret, 403. No secret presented at all, 404: an endpoint that
//      answers differently to an empty request has told an unauthenticated
//      caller it exists.
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

  const email = typeof body.email === 'string' ? body.email : null
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !link.properties?.hashed_token) {
    return NextResponse.json(
      { error: `could not generate a link for ${email}: ${linkError?.message ?? 'no token'}` },
      { status: 500 }
    )
  }

  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'email',
  })
  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email })
}
