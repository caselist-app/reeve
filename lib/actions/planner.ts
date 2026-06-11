'use server'

import { nearestAirport, estimateGroundMinutes } from '@/lib/logistics/airports'

// Geocode a city name to its nearest airport IATA code.
// Used by the departure selector when the TM enters a custom city.
export async function resolveHomeCity(
  city: string
): Promise<{ iata: string | null; lat: number | null; lng: number | null; ground_minutes: number | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || !city.trim()) return { iata: null, lat: null, lng: null, ground_minutes: null }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${apiKey}`
    const res = await fetch(url)
    const data = await res.json() as {
      status: string
      results: { geometry: { location: { lat: number; lng: number } } }[]
    }

    if (data.status !== 'OK' || !data.results[0]) return { iata: null, lat: null, lng: null, ground_minutes: null }

    const { lat, lng } = data.results[0].geometry.location
    const { airport, distKm } = nearestAirport(lat, lng)

    return {
      iata: airport.iata,
      lat,
      lng,
      ground_minutes: estimateGroundMinutes(distKm),
    }
  } catch {
    return { iata: null, lat: null, lng: null, ground_minutes: null }
  }
}
