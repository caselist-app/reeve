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

// Relative day label vs today, evaluated in the tour timezone.
export function relativeDay(dateStr: string, timezone: string): string {
  // en-CA renders YYYY-MM-DD, which is what we compare on.
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const today = Date.parse(`${todayStr}T00:00:00Z`)
  const target = Date.parse(`${dateStr}T00:00:00Z`)
  const diffDays = Math.round((target - today) / 86_400_000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 1) return `in ${diffDays} days`
  return `${Math.abs(diffDays)} days ago`
}
