// Path patterns for routes that supply their own app/(app)/@secondaryPanel
// content (see app/(app)/@secondaryPanel/.../layout.tsx for each one).
//
// Next.js only falls back to a slot's default.tsx on a hard navigation
// (full page load or refresh). On client-side navigation away from a route
// that has a secondary panel, Next.js keeps rendering the slot's last
// resolved content instead of re-resolving it, so the panel would otherwise
// follow the user to routes that never asked for one. AppContent checks
// pathname against this list on every render as a deterministic visibility
// gate, independent of whatever the RSC slot itself is currently showing.
//
// Add a pattern here whenever a new route gets its own @secondaryPanel
// override; nothing else in app-content.tsx needs to change.
const SECONDARY_PANEL_ROUTE_PATTERNS: RegExp[] = [
  /^\/tours\/[^/]+\/schedule(\/|$)/,
]

export function hasSecondaryPanel(pathname: string): boolean {
  return SECONDARY_PANEL_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
}
