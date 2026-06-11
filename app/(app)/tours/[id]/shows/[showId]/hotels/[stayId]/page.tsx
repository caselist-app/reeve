import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { HotelStayDetail } from '@/components/planner/hotel-stay-detail'

export default async function HotelStayPage({
  params,
}: {
  params: Promise<{ id: string; showId: string; stayId: string }>
}) {
  const { id, showId, stayId } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, artist_act')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const [{ data: show }, { data: stay }] = await Promise.all([
    supabase
      .from('shows')
      .select('id, venue_name, date')
      .eq('id', showId)
      .eq('tour_id', id)
      .single(),
    supabase
      .from('hotel_stays')
      .select('*, room_assignments(*, people!person_id(id, person_type, contacts(name)))')
      .eq('id', stayId)
      .eq('tour_id', id)
      .single(),
  ])

  if (!show || !stay) redirect(`/tours/${id}/shows/${showId}/hotels`)

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/tours/${id}/shows/${showId}/hotels`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Hotel search
      </Link>

      <div className="mb-8">
        <p className="text-sm text-muted-foreground">{tour.artist_act}</p>
        <h1 className="text-2xl font-semibold">{stay.name ?? 'Hotel stay'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{show.venue_name}</p>
      </div>

      <HotelStayDetail stay={stay} tourId={id} />
    </div>
  )
}
