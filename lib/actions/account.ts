'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

// Generates a one-time Telegram deep link for the account holder's own chat, so
// Reeve can message the TM directly (REE-132). Unlike createTelegramLinkToken in
// lib/actions/contacts.ts, the token carries no contact_id: the /start branch in
// app/api/telegram/inbound resolves a null-contact_id token by writing
// accounts.telegram_chat_id rather than a contact's. A chat id is per account,
// not per tour, which is why this lives in account settings.
export async function createAccountTelegramLinkToken(): Promise<{
  error: string | null
  deepLink?: string
}> {
  const user = await requireUser()

  const supabase = await createClient()

  const botUsername = process.env.TELEGRAM_BOT_USERNAME
  if (!botUsername) {
    return { error: 'Telegram is not configured yet.' }
  }

  // contact_id is omitted: RLS on telegram_link_tokens scopes by account_id =
  // auth.uid(), which is the ownership gate here. The insert leaves contact_id
  // null, the marker the webhook reads to link the account rather than a contact.
  const { data: row, error } = await supabase
    .from('telegram_link_tokens')
    .insert({ account_id: user.id })
    .select('token')
    .single()

  if (error || !row) {
    return { error: error?.message ?? 'Could not create a Telegram link.' }
  }

  return { error: null, deepLink: `https://t.me/${botUsername}?start=${row.token}` }
}

// Ends the account holder's session and returns them to login.
export async function signOutAction(): Promise<void> {
  await requireUser()

  const supabase = await createClient()
  await supabase.auth.signOut()

  redirect('/login')
}
