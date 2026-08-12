'use client'

import { create } from 'zustand'

// Optimistic override for the Inbox badge's open-item count, in the sidebar.
//
// The count is computed server-side in app/(app)/layout.tsx, which sits above
// every route, including /inbox and wherever an item gets resolved. A
// revalidatePath or router.refresh across that boundary is the exact class of
// bug fixed in REE-65 and REE-131: it does not reliably repaint a layout from
// a nested route. So a resolve writes the count it computed here instead, and
// the badge reads it as an optimistic patch on top of the server value.
//
// The override is stamped with the server value it was computed from
// (basedOn), rather than cleared explicitly. That value moving (a fresh
// server render, whether from a hard navigation or an unrelated revalidate)
// means the override was based on a count that is no longer current, so it is
// ignored rather than shadowing the fresh number: this is what lets the badge
// self-heal without an explicit clear() call anywhere.
export interface InboxCountOverride {
  basedOn: number
  value: number
}

interface InboxCountState {
  // The last value the sidebar itself rendered from the server, kept here so a
  // producer resolving an item elsewhere (e.g. the guest list panel) can stamp
  // its override with the same basedOn the badge is currently checking against,
  // without prop-drilling the count into every place that can resolve an item.
  // Sidebar is the only writer, synced from its own server prop.
  serverCount: number
  setServerCount: (count: number) => void
  override: InboxCountOverride | null
  setOverride: (basedOn: number, value: number) => void
}

export const useInboxCountStore = create<InboxCountState>()((set) => ({
  serverCount: 0,
  setServerCount: (count) => set({ serverCount: count }),
  override: null,
  setOverride: (basedOn, value) => set({ override: { basedOn, value } }),
}))

export function selectOpenCount(serverCount: number, override: InboxCountOverride | null): number {
  if (!override || override.basedOn !== serverCount) return serverCount
  return Math.max(0, override.value)
}
