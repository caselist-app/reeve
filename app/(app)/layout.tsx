import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { ResizableSidebar } from '@/components/layout/resizable-sidebar'
import { CommandPalette } from '@/components/nav/command-palette'

const DEFAULT_SIDEBAR_WIDTH = 220
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 320

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const supabase = await createClient()

  // Fetch all active tours for the sidebar tour selector.
  const { data: tours } = await supabase
    .from('tours')
    .select('id, name, artist_act')
    .eq('account_id', user.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

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
      <ResizableSidebar tours={tours ?? []} initialWidth={sidebarWidth} lastTourId={lastTourId} />

      {/* Main content floats inside the sidebar background, rounded card style like Croft */}
      <div className="flex flex-1 gap-2 py-2 pr-2 min-h-0 overflow-hidden">
        <main className="flex-1 min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Command palette — mounts once, listens for ⌘K globally */}
      <CommandPalette />
    </div>
  )
}
