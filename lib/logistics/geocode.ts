// Geocodes a free-text address to lat/lng via the Google Maps Geocoding API.
// Shared by venue hub resolution (lib/logistics/hub-resolver.ts) and hotel
// stay geocoding (lib/logistics/hotel-geocode.ts): both cache a
// static-map-ready coordinate pair on their own row and re-geocode only when
// the address changes.
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || !address) return null

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`

  let data: { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }
  try {
    const res = await fetch(url)
    data = (await res.json()) as typeof data
  } catch {
    return null
  }

  if (data.status !== 'OK' || !data.results[0]) return null

  return data.results[0].geometry.location
}
