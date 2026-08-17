'use server'

import { requireUser } from '@/lib/auth/helpers'

export type DriveTimeResult = { arrive_at: string | null; duration_min: number | null }

interface DirectionsResponse {
  status: string
  error_message?: string
  routes: Array<{ legs: Array<{ duration_in_traffic?: { value: number }; duration: { value: number } }> }>
}

// Calls Google Maps Directions API to get drive duration between two addresses.
// Returns arrive_at as a UTC ISO string computed from departure + duration.
export async function getDriveTime(
  origin: string,
  destination: string,
  departAtLocal: string,   // datetime-local string from the form (YYYY-MM-DDTHH:MM)
  timezone: string,
): Promise<DriveTimeResult> {
  await requireUser()

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error('[drive-time] GOOGLE_MAPS_API_KEY not set')
    return { arrive_at: null, duration_min: null }
  }

  // Convert departure local time to Unix timestamp for Google.
  const departUtc = new Date(`${departAtLocal}:00Z`)
  const localStr = departUtc.toLocaleString('sv-SE', { timeZone: timezone }).slice(0, 19)
  const localAsUtc = new Date(`${localStr.replace(' ', 'T')}.000Z`)
  const offsetMs = departUtc.getTime() - localAsUtc.getTime()
  const departUnix = Math.floor(new Date(departUtc.getTime() + offsetMs).getTime() / 1000)

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', origin)
  url.searchParams.set('destination', destination)
  url.searchParams.set('departure_time', String(departUnix))
  url.searchParams.set('key', apiKey)

  let data: DirectionsResponse
  try {
    const res = await fetch(url.toString())
    data = (await res.json()) as DirectionsResponse
  } catch (err) {
    console.error('[drive-time] fetch error:', err)
    return { arrive_at: null, duration_min: null }
  }

  const leg = data.routes[0]?.legs[0]
  if (data.status !== 'OK' || !leg) {
    console.error(
      '[drive-time] status:', data.status, data.error_message ?? '',
      '| origin_sent:', origin,
      '| dest_sent:', destination,
      '| departure_time:', departUnix,
    )
    return { arrive_at: null, duration_min: null }
  }

  const durationSec = leg.duration_in_traffic?.value ?? leg.duration.value
  const durationMin = Math.round(durationSec / 60)
  const arriveAt = new Date((departUnix + durationSec) * 1000).toISOString()

  return { arrive_at: arriveAt, duration_min: durationMin }
}
