import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'
import { NewTourForm } from '@/components/tours/new-tour-form'

export default async function NewTourPage() {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from('artists')
    .select('id, name, slug')
    .eq('account_id', user.id)
    .order('name')
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">New tour</h1>
      <NewTourForm artists={data ?? []} />
    </div>
  )
}
