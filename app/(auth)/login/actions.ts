'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { otpSchema } from '@/lib/validators/auth'
import { otpRatelimit } from '@/lib/ratelimit'

export type RequestOtpState = { error: string | null; sent: boolean; email: string }
export type VerifyOtpState = { error: string | null }

export async function requestOtpAction(
  _prev: RequestOtpState,
  formData: FormData
): Promise<RequestOtpState> {
  const parsed = z.string().email().safeParse(formData.get('email'))
  if (!parsed.success) {
    return { error: 'Enter a valid email address.', sent: false, email: '' }
  }

  const { success: allowed } = await otpRatelimit.limit(parsed.data)
  if (!allowed) {
    return { error: 'Too many requests. Please wait a few minutes and try again.', sent: false, email: '' }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: true,
      // Magic link fallback: if the user clicks the email link rather than entering
      // the code, /auth/callback will handle the session exchange.
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  })

  if (error) return { error: error.message, sent: false, email: '' }
  return { error: null, sent: true, email: parsed.data }
}

export async function verifyOtpAction(
  _prev: VerifyOtpState,
  formData: FormData
): Promise<VerifyOtpState> {
  const parsed = otpSchema.safeParse({
    email: formData.get('email'),
    token: formData.get('token'),
  })
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid code.'
    return { error: message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'email',
  })

  if (error || !data.user) {
    return { error: 'Incorrect or expired code. Try again.' }
  }

  // Create accounts row if this is a new user. Check first to make sign-in idempotent.
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
      console.error('accounts insert failed:', insertError)
      return { error: 'Account setup failed. Please try again.' }
    }
  }

  redirect('/')
}
