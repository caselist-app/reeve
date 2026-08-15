// Expiry status, shared by passports and visas across the Roster and a
// tour's People page. "soon" is within 90 days, the window where a TM
// should be chasing a renewal.

export type ExpiryStatus = 'none' | 'expired' | 'soon' | 'ok'

export function expiryStatus(expiry: string | null): ExpiryStatus {
  if (!expiry) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Append time so the date is read in local time, not shifted by UTC parsing.
  const exp = new Date(`${expiry}T00:00:00`)
  const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return 'expired'
  if (days <= 90) return 'soon'
  return 'ok'
}

export function formatExpiry(expiry: string | null): string {
  if (!expiry) return '-'
  return new Date(`${expiry}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
