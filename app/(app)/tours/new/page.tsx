import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'
import { NewTourForm } from '@/components/tours/new-tour-form'
import { PageLayout } from '@/components/layout/page-layout'

export default async function NewTourPage() {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from('artists')
    .select('id, name, slug')
    .eq('account_id', user.id)
    .order('name')
  return (
    <PageLayout maxWidth="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold md:mb-8">New tour</h1>
      <NewTourForm artists={data ?? []} />
    </PageLayout>
  )
}
