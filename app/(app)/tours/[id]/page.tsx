import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

// Tour home redirects to the next upcoming schedule date, or the most recent
// past date if the tour has finished, or the schedule list if no dates exist.
export default async function TourHomePage({
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

  // Try the next upcoming date first.
  const { data: next } = await supabase
    .from('tour_dates')
    .select('date')
    .eq('tour_id', id)
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(1)
    .single()

  if (next) {
    redirect(`/tours/${id}/schedule?date=${next.date}`)
  }

  // Tour is in the past — go to the most recent date.
  const { data: last } = await supabase
    .from('tour_dates')
    .select('date')
    .eq('tour_id', id)
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (last) {
    redirect(`/tours/${id}/schedule/${last.date}`)
  }

  // No dates yet — go to the schedule list.
  redirect(`/tours/${id}/shows`)
}
