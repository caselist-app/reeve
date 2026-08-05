import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { ResizableSidebar } from '@/components/layout/resizable-sidebar'
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer'
import { AppContent } from '@/components/layout/app-content'
import { LazyCommandPalette } from '@/components/nav/lazy-command-palette'
import { Toaster } from '@/components/ui/sonner'

const DEFAULT_SIDEBAR_WIDTH = 220
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 320

export default async function AppLayout({
  children,
  secondaryPanel,
}: {
  children: React.ReactNode
  // Populated by the app/(app)/@secondaryPanel slot. Most routes render
  // nothing here (see @secondaryPanel/default.tsx); routes that need a
  // standalone, always-visible panel next to main content (e.g. the schedule
  // Dates list) supply it via their own @secondaryPanel override.
  secondaryPanel: React.ReactNode
}) {
  const user = await requireUser()
  const supabase = await createClient()

  // Tours for the selector, and the count of emails waiting to be reviewed on
  // each one, for the Extractions badge in the tour settings panel. Independent
  // queries, so they run together rather than in two waves. forwarded_emails is
  // scoped by owns_tour(tour_id) in RLS, so it needs no tour filter of its own.
  const [{ data: toursRaw }, { data: awaitingReview }] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, status, artist_id, artists(name)')
      .eq('account_id', user.id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabase
      .from('forwarded_emails')
      .select('tour_id')
      .eq('extraction_status', 'extracted'),
  ])

  const tours = (toursRaw ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    artist_id: t.artist_id,
    artist_name: t.artists?.name ?? t.name,
  }))

  const extractionsAwaitingReview: Record<string, number> = {}
  for (const row of awaitingReview ?? []) {
    extractionsAwaitingReview[row.tour_id] = (extractionsAwaitingReview[row.tour_id] ?? 0) + 1
  }

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

  // Read persisted collapsed state so the server renders the icon-only rail
  // correctly on first paint, same reasoning as the width cookie above.
  const isCollapsed = cookieStore.get('reeve:sidebar-collapsed')?.value === '1'

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar">
      {/* Desktop: always-visible resizable sidebar. Hidden on mobile. */}
      <div className="hidden md:contents">
        <ResizableSidebar
          tours={tours ?? []}
          initialWidth={sidebarWidth}
          initialCollapsed={isCollapsed}
          lastTourId={lastTourId}
          extractionsAwaitingReview={extractionsAwaitingReview}
        />
      </div>

      {/* Mobile: sidebar rendered inside a drawer opened by the hamburger. */}
      <MobileNavDrawer
        tours={tours ?? []}
        lastTourId={lastTourId}
        extractionsAwaitingReview={extractionsAwaitingReview}
      />

      {/* AppContent owns the main card, the secondary panel, and the side panel. */}
      <AppContent secondaryPanel={secondaryPanel}>{children}</AppContent>

      {/* Command palette is lazy-loaded so the first app shell stays light. */}
      <LazyCommandPalette />

      {/* Mounted here, outside AppContent, deliberately: an add form's panel
          closes on success, and a toast rendered inside the panel would close with
          it. That case (panel closes, timeline unchanged, no trace of the record)
          is the whole reason the toast exists. */}
      <Toaster />
    </div>
  )
}
