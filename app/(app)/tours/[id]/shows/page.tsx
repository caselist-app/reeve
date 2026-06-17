import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

// /shows is no longer a standalone view — redirect to the schedule day view.
export default async function ShowsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const today = new Date().toISOString().slice(0, 10)

  const { data: next } = await supabase
    .from('tour_dates')
    .select('date')
    .eq('tour_id', id)
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(1)
    .single()

  if (next) redirect(`/tours/${id}/schedule?date=${next.date}`)

  const { data: last } = await supabase
    .from('tour_dates')
    .select('date')
    .eq('tour_id', id)
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (last) redirect(`/tours/${id}/schedule?date=${last.date}`)

  redirect(`/tours/${id}/schedule`)
}
