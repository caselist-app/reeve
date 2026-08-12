import { localDateInZone, localTimeInZone, daysBetween } from '@/lib/schedule/datetime'

// Shared between the Inbox list (components/inbox/inbox-view.tsx) and the item
// detail route (app/(app)/inbox/[itemId]/page.tsx). Relative time reads in the
// item's own tour timezone, the same authority the schedule uses
// (localDateInZone), not the tour's timezone read through Intl at render time:
// that would resolve differently on the server and in the browser, flipping
// "Today" to "Yesterday" on first hydration for anyone not on UTC. timezone is
// nullable on tours, so a tour that never set one falls back to UTC, same as
// the schedule route does.
export function relativeLabel(iso: string, timezone: string | null): string {
  const tz = timezone ?? 'UTC'
  const day = localDateInZone(iso, tz)
  const today = localDateInZone(new Date().toISOString(), tz)
  const diff = daysBetween(day, today)
  const time = localTimeInZone(iso, tz)

  if (diff === 0) return `Today ${time}`
  if (diff === 1) return `Yesterday ${time}`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz })
}
