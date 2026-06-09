import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { TourSettingsForm } from '@/components/tours/settings-form'

export default async function TourSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('*')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) {
    redirect('/app')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">Tour settings</h1>
      <TourSettingsForm tour={tour} />
    </div>
  )
}
