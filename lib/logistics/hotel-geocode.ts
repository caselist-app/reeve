import { createAdminClient } from '@/lib/supabase/admin'
import { geocodeAddress } from '@/lib/logistics/geocode'

// Geocodes a hotel stay's address and caches lat/lng on the row, the same
// static-map cache shows.venue_lat/venue_lng feeds (REE-178, REE-206).
// Unlike venue hub resolution there is no airport to resolve: the geocode is
// the entire job. A no-op when there is no address or the geocode fails,
// matching resolveHub's tolerant style: the map block simply has nothing to
// render rather than the job throwing.
export async function resolveHotelGeocode(stayId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: stay } = await admin
    .from('hotel_stays')
    .select('address')
    .eq('id', stayId)
    .single()

  if (!stay?.address) return

  const geocoded = await geocodeAddress(stay.address)
  if (!geocoded) return

  await admin
    .from('hotel_stays')
    .update({ lat: geocoded.lat, lng: geocoded.lng })
    .eq('id', stayId)
}
