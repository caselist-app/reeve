'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signUpSchema } from '@/lib/validators/auth'

export type SignUpState = { error: string | null }

export async function signUpAction(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error || !data.user) {
    return { error: error?.message ?? 'Sign-up failed.' }
  }

  const admin = createAdminClient()
  const { error: insertError } = await admin.from('accounts').insert({
    id: data.user.id,
    name: parsed.data.name,
    email: parsed.data.email,
    subscription_status: 'trialing',
  })

  if (insertError) {
    // Clean up the orphaned auth user before returning the error.
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: 'Account setup failed. Please try again.' }
  }

  redirect('/app')
}
