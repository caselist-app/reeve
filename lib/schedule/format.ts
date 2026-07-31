// Shared formatting helpers for the schedule day view.

// City, Country from a geocoded address. Last comma-part is the country, the
// second-to-last is the city with postcode tokens (anything with a digit)
// stripped, so "C. Puebla de Sanabria, 7, 49005 Zamora, Spain" -> "Zamora, Spain".
export function parseLocation(address: string | null): string {
  if (!address) return ''
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]

  const country = parts[parts.length - 1]
  const cityRaw = parts[parts.length - 2]
  const city = cityRaw
    .split(/\s+/)
    .filter((tok) => !/\d/.test(tok))
    .join(' ')
    .trim()

  return [city || cityRaw, country].filter(Boolean).join(', ')
}

// Just the city (first part of parseLocation).
export function parseCity(address: string | null): string {
  const loc = parseLocation(address)
  return loc.split(',')[0]?.trim() ?? ''
}
