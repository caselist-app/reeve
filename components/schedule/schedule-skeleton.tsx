// Skeleton placeholders for the schedule day view. They mirror the three-column
// layout (230px date sidebar, flex-1 timeline, 260px info panel) so the frame
// paints instantly with no layout shift while the day's data resolves.

export function SidebarSkeleton() {
  return (
    <div className="w-[230px] shrink-0 border-r border-border flex flex-col overflow-hidden animate-pulse">
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
        <div className="h-3 w-10 rounded bg-muted" />
        <div className="h-5 w-5 rounded bg-muted" />
      </div>
      <div className="flex-1 overflow-hidden p-2 space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-1.5 py-1.5">
            <div className="h-9 w-9 shrink-0 rounded-md bg-muted" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-2.5 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// The flex-1 timeline plus the 260px info panel. Used on its own as the
// Suspense fallback while only the day's data is still loading.
export function DayContentSkeleton() {
  return (
    <div className="flex flex-1 min-w-0 min-h-0 animate-pulse">
      {/* Timeline */}
      <div className="relative flex flex-col flex-1 min-w-0 lg:border-r lg:border-border">
        {/* Header bar */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-border">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted" />
            <div className="h-8 w-8 rounded-lg bg-muted" />
          </div>
        </div>
        {/* Timeline rows */}
        <div className="flex-1 overflow-hidden py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-8 py-3">
              <div className="w-12 shrink-0 pt-1">
                <div className="ml-auto h-3 w-9 rounded bg-muted" />
              </div>
              <div className="flex flex-col items-center shrink-0 mt-1">
                <span className="h-2 w-2 rounded-full bg-muted" />
                <span className="w-px flex-1 bg-muted mt-1" />
              </div>
              <div className="flex-1 rounded-lg border-l-2 border-muted bg-card px-3 py-2 space-y-1.5">
                <div className="h-2.5 w-12 rounded bg-muted" />
                <div className="h-3.5 w-40 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Info panel — hidden on mobile, matches the live right panel */}
      <div className="hidden lg:block w-[260px] shrink-0 px-4 py-4 space-y-5">
        <div className="space-y-2">
          <div className="h-2.5 w-12 rounded bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-3 w-24 rounded bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-2.5 w-12 rounded bg-muted" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// The full three-column shell, used as the route-level loading fallback before
// the page itself has rendered.
export function ScheduleSkeleton() {
  return (
    <div className="flex h-full overflow-hidden">
      <SidebarSkeleton />
      <DayContentSkeleton />
    </div>
  )
}
