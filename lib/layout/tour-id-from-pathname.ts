// /tours/new is the "create a tour" page, not a tour detail route, but it
// matches the same /tours/:segment shape as a real tour id. Reading the
// segment naively (sidebar.tsx and command-palette.tsx both used to) treats
// "new" as a tour id: the sidebar then builds nav hrefs like
// /tours/new/schedule and writes reeve:last-tour=new, and the command
// palette fetches palette data for a tour "new" that does not exist.
const RESERVED_TOUR_SEGMENTS = new Set(['new'])

export function tourIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/\/tours\/([^/]+)/)
  const segment = match?.[1] ?? null
  if (!segment || RESERVED_TOUR_SEGMENTS.has(segment)) return null
  return segment
}
