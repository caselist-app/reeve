import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { ConnectTelegramAccount } from '@/components/account/connect-telegram-account'
import { AppearanceSettings } from '@/components/account/appearance-settings'
import { SignOutButton } from '@/components/account/sign-out-button'

// Account settings, distinct from a tour's settings: this is about the account
// holder (the TM), not one of their tours.
export default async function AccountSettingsPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: account } = await supabase
    .from('accounts')
    .select('name, telegram_chat_id')
    .eq('id', user.id)
    .single()

  if (!account) {
    redirect('/')
  }

  return (
    <PageLayout maxWidth="max-w-lg">
      <PageHeader eyebrow={account.name} title="Account settings" />
      <div className="flex flex-col gap-4">
        <ConnectTelegramAccount connected={account.telegram_chat_id !== null} />
        <AppearanceSettings />
        <SignOutButton />
      </div>
    </PageLayout>
  )
}
