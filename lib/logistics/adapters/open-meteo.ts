// Open-Meteo adapter: current conditions for a coordinate.
// Returns a normalised { tempC, code } shape, never a raw Open-Meteo payload.
// No API key: Open-Meteo's free tier is unauthenticated.

const BASE = 'https://api.open-meteo.com/v1/forecast'

interface OpenMeteoCurrentResponse {
  current?: {
    temperature_2m?: number
    weather_code?: number
  }
}

export type NormalizedWeather = {
  tempC: number
  code: number // WMO weather interpretation code
}

// Fetches current conditions for a lat/lon and normalises to tempC + code.
// Returns null on any error response, malformed payload, or network failure,
// rather than throwing: a failed weather lookup is not fatal to a show row.
export async function fetchOpenMeteoWeather(
  latitude: number,
  longitude: number
): Promise<NormalizedWeather | null> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,weather_code',
  })

  let json: OpenMeteoCurrentResponse
  try {
    const res = await fetch(`${BASE}?${query.toString()}`)
    if (!res.ok) return null
    json = (await res.json()) as OpenMeteoCurrentResponse
  } catch {
    return null
  }

  const { temperature_2m, weather_code } = json.current ?? {}
  if (typeof temperature_2m !== 'number' || typeof weather_code !== 'number') {
    return null
  }

  return { tempC: temperature_2m, code: weather_code }
}
