import { task } from '@trigger.dev/sdk/v3'
import { resolveHotelGeocode } from '@/lib/logistics/hotel-geocode'

export type ResolveHotelGeocodePayload = {
  stay_id: string
}

// Geocodes and caches lat/lng for a hotel stay so the day info Hotel block can
// render the same static map view as the Venue block (REE-206). Triggered on
// hotel stay create and whenever its address changes.
export const resolveHotelGeocodeJob = task({
  id: 'resolve-hotel-geocode',
  run: async (payload: ResolveHotelGeocodePayload) => {
    await resolveHotelGeocode(payload.stay_id)
  },
})
