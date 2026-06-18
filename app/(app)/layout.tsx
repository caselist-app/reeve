import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { ResizableSidebar } from '@/components/layout/resizable-sidebar'
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer'
import { AppContent } from '@/components/layout/app-content'
import { CommandPalette } from '@/components/nav/command-palette'

const DEFAULT_SIDEBAR_WIDTH = 220
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 320

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const supabase = await createClient()

  // Fetch all active tours for the sidebar tour selector.
  const { data: toursRaw } = await supabase
    .from('tours')
    .select('id, name, status, artist_id, artists(name)')
    .eq('account_id', user.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  const tours = (toursRaw ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    artist_id: t.artist_id,
    artist_name: t.artists?.name ?? t.name,
  }))

  // Read persisted sidebar width from cookie so the server renders it correctly
  // on first paint without a layout shift.
  const cookieStore = await cookies()
  const rawWidth = parseInt(
    cookieStore.get('reeve:sidebar-width')?.value ?? String(DEFAULT_SIDEBAR_WIDTH),
    10,
  )
  const sidebarWidth = isNaN(rawWidth)
    ? DEFAULT_SIDEBAR_WIDTH
    : Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, rawWidth))

  // Last tour visited, so account-level pages keep the tour context in the sidebar.
  const lastTourId = cookieStore.get('reeve:last-tour')?.value ?? null

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar">
      {/* Desktop: always-visible resizable sidebar. Hidden on mobile. */}
      <div className="hidden md:contents">
        <ResizableSidebar tours={tours ?? []} initialWidth={sidebarWidth} lastTourId={lastTourId} />
      </div>

      {/* Mobile: sidebar rendered inside a drawer opened by the hamburger. */}
      <MobileNavDrawer tours={tours ?? []} lastTourId={lastTourId} />

      {/* AppContent owns the main card and the side panel, both animated. */}
      <AppContent>{children}</AppContent>

      {/* Command palette, mounts once, listens for Cmd+K globally */}
      <CommandPalette />
    </div>
  )
}
