import { redirect } from 'next/navigation'

// Hotel search is hidden for launch (REE-228): every hotel adapter
// (RateHawk, Hotelbeds, Expedia Rapid) is an unbuilt stub returning `[]`,
// so HotelWorkspace's real spinner used to resolve to a confident
// "No artist options found." that read as no hotels near the venue rather
// than not built yet. Backend (planHotels, the adapters, lib/logistics/hotels.ts)
// is untouched, so re-enabling this route is the only step needed later.
export default async function HotelsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/tours/${id}/schedule`)
}
