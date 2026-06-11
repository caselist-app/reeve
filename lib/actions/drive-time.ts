'use server'

import { requireUser } from '@/lib/auth/helpers'

export type DriveTimeResult = { arrive_at: string | null; duration_min: number | null }

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
  if (!apiKey) return { arrive_at: null, duration_min: null }

  try {
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

    const res = await fetch(url.toString())
    const data = await res.json() as {
      status: string
      routes: Array<{ legs: Array<{ duration_in_traffic?: { value: number }; duration: { value: number } }> }>
    }

    if (data.status !== 'OK' || !data.routes[0]) return { arrive_at: null, duration_min: null }

    const leg = data.routes[0].legs[0]
    if (!leg) return { arrive_at: null, duration_min: null }

    const durationSec = leg.duration_in_traffic?.value ?? leg.duration.value
    const durationMin = Math.round(durationSec / 60)

    const departIso = new Date(departUnix * 1000).toISOString()
    const arriveAt = new Date(new Date(departIso).getTime() + durationSec * 1000).toISOString()

    return { arrive_at: arriveAt, duration_min: durationMin }
  } catch {
    return { arrive_at: null, duration_min: null }
  }
}
