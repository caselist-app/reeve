import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeRelativePath } from '@/lib/auth/helpers'

// Handles Supabase magic link clicks. Exchanges the code for a session,
// creates the accounts row for new users, then redirects to the app.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeRelativePath(searchParams.get('next') ?? '/')

  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // Create accounts row if this is a new user.
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('accounts')
    .select('id')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!existing) {
    const { error: insertError } = await admin.from('accounts').insert({
      id: data.user.id,
      name: data.user.email?.split('@')[0] ?? 'Tour Manager',
      email: data.user.email!,
      subscription_status: 'trialing',
    })
    if (insertError) {
      console.error('accounts insert failed in /auth/callback:', insertError)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
