import {
  createServerClient,
  combineChunks,
  stringFromBase64URL,
  type CookieOptions,
} from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// How close to expiry the access token has to be before we spend a network
// round trip refreshing it. Comfortably longer than any single request.
const REFRESH_SKEW_SECONDS = 60

const BASE64_PREFIX = 'base64-'

// No access token legitimately lasts a day. Anything claiming to is a corrupt
// or forged cookie, and is treated as unreadable so it cannot pin the fast path
// and suppress refresh indefinitely.
const MAX_PLAUSIBLE_LIFETIME_SECONDS = 86_400

// The cookie key @supabase/ssr writes the session under, derived from the
// project ref in the Supabase URL (e.g. sb-abcdefgh-auth-token). Large sessions
// are split across .0, .1, ... chunks, which combineChunks reassembles.
//
// This assumes the Supabase URL is the standard https://<ref>.supabase.co form,
// which is how auth-js derives the key too. If Supabase is ever moved behind a
// custom domain (plausible during the tourwithreeve.com migration) this returns
// a key that matches no cookie, every request falls to the slow path, and the
// only symptom is that the optimisation silently stops working.
function authStorageKey(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    const ref = new URL(url).hostname.split('.')[0]
    return ref ? `sb-${ref}-auth-token` : null
  } catch {
    return null
  }
}

/**
 * Reads the session's expiry straight out of the cookie, with no network call.
 *
 * Returns null whenever the answer is not certain (no cookie, unparseable
 * payload, missing expires_at). Every null path falls through to a real
 * getUser() in updateSession, so the failure mode is the old behaviour rather
 * than a skipped refresh.
 *
 * This deliberately does not trust the cookie for authorisation. It only
 * decides whether the token is old enough to be worth refreshing. See the note
 * on updateSession.
 */
async function readSessionExpiry(request: NextRequest): Promise<number | null> {
  const key = authStorageKey()
  if (!key) return null

  let combined: string | null
  try {
    combined = await combineChunks(key, (name) => request.cookies.get(name)?.value ?? null)
  } catch {
    return null
  }
  if (!combined) return null

  try {
    const json = combined.startsWith(BASE64_PREFIX)
      ? stringFromBase64URL(combined.slice(BASE64_PREFIX.length))
      : combined
    const session = JSON.parse(json) as { expires_at?: unknown }
    const expiresAt = session.expires_at
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null

    // Reject implausibly distant expiries (see MAX_PLAUSIBLE_LIFETIME_SECONDS).
    if (expiresAt > Math.floor(Date.now() / 1000) + MAX_PLAUSIBLE_LIFETIME_SECONDS) {
      return null
    }

    return expiresAt
  } catch {
    return null
  }
}

/**
 * Keeps the Supabase session cookie fresh.
 *
 * This is a session-refresh hook, not an authorisation gate. It never redirects
 * and never blocks a request. Every authenticated read and write is gated by
 * requireUser() inside the render or the server action, which still calls
 * getUser() and still validates the token against the Supabase Auth server on
 * every request. Nothing here weakens that.
 *
 * What changed and why: this used to call getUser() unconditionally, which is a
 * network round trip to Supabase Auth on literally every request, including
 * every <Link> prefetch. On the schedule that made each date click pay two
 * serial auth round trips before a single row was read. The expiry is now read
 * from the cookie locally, and getUser() only runs when the token is genuinely
 * near expiry and needs rotating.
 *
 * Never substitute getSession() for getUser() in the refresh path below: it
 * only reads the local cookie and cannot detect a revoked token.
 */
export async function updateSession(request: NextRequest) {
  const expiresAt = await readSessionExpiry(request)
  const nowSeconds = Math.floor(Date.now() / 1000)

  // Fast path: a session cookie is present and not close to expiring, so there
  // is nothing to refresh. Pass the request through untouched.
  if (expiresAt !== null && expiresAt - nowSeconds > REFRESH_SKEW_SECONDS) {
    return { supabaseResponse: NextResponse.next({ request }) }
  }

  // Slow path: no readable session, or the token is at or near expiry. Let the
  // SDK do a real getUser(), which rotates the token and writes the refreshed
  // cookies onto the response.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()

  return { supabaseResponse }
}
