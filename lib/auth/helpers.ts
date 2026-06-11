import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Use in any Server Component or server action that requires a signed-in user.
// Redirects to /login if no valid session; returns the user if there is one.
// Wrapped in React.cache() so multiple Server Components in the same render
// tree share a single supabase.auth.getUser() call instead of paying one
// round trip each. Does NOT deduplicate across server actions.
export const requireUser = cache(async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return user
})

// Use when you want the user if present but can handle the unauthenticated case
// yourself (e.g. public pages that show different content when signed in).
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

// Validates that a redirect target is a safe relative path.
// Prevents open redirect attacks from untrusted next= query params.
export function safeRelativePath(url: string): string {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
    return url
  }
  return '/'
}
