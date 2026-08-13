import type { createClient } from '@/lib/supabase/server'
import { fetchOpenMeteoWeather } from '@/lib/logistics/adapters/open-meteo'

type Client = Awaited<ReturnType<typeof createClient>>

// Brief 57. Cache TTL for a show's weather: current conditions drift enough
// that a same-day render should refresh, but not so much that every render
// should call the provider.
const STALE_AFTER_MS = 3 * 60 * 60 * 1000 // 3 hours

export type ShowWeather = {
  tempC: number
  code: number // WMO weather interpretation code, see lib/weather/wmo-codes.ts
} | null

/**
 * A show's cached weather, refetched from Open-Meteo when missing or stale.
 *
 * Never geocodes: venue_lat/venue_lng are resolved elsewhere (hub resolution,
 * the planner), and null coordinates here just means null weather, no call.
 * A write-back failure is logged and swallowed, never thrown: the caller
 * still gets the weather it just fetched, and the next stale call retries
 * the write.
 */
export async function resolveShowWeather(
  supabase: Client,
  showId: string
): Promise<ShowWeather> {
  const { data: show, error } = await supabase
    .from('shows')
    .select('venue_lat, venue_lng, weather_temp_c, weather_code, weather_fetched_at')
    .eq('id', showId)
    .single()

  if (error || !show) {
    console.error('[venue-weather] could not read the show:', error?.message)
    return null
  }

  if (show.venue_lat == null || show.venue_lng == null) return null

  const isFresh =
    show.weather_fetched_at != null &&
    Date.now() - new Date(show.weather_fetched_at).getTime() < STALE_AFTER_MS

  if (isFresh) {
    return show.weather_temp_c != null && show.weather_code != null
      ? { tempC: show.weather_temp_c, code: show.weather_code }
      : null
  }

  const fetched = await fetchOpenMeteoWeather(show.venue_lat, show.venue_lng)
  if (!fetched) return null

  const { error: writeError } = await supabase
    .from('shows')
    .update({
      weather_temp_c: fetched.tempC,
      weather_code: fetched.code,
      weather_fetched_at: new Date().toISOString(),
    })
    .eq('id', showId)

  if (writeError) {
    console.error('[venue-weather] could not write the weather cache:', writeError.message)
  }

  return fetched
}
