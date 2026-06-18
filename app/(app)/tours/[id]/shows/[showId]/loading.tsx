// Instant frame for the show detail route. Mirrors the PageLayout (max-w-3xl)
// shell: back link, header, tab bar, and a few form-field rows, so navigation
// paints immediately instead of blocking on the show's data batch.
export default function ShowDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 animate-pulse">
      {/* Back link */}
      <div className="mb-6 h-4 w-16 rounded bg-muted" />

      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-7 w-64 rounded bg-muted" />
        <div className="h-4 w-40 rounded bg-muted" />
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 rounded-md bg-muted" />
        ))}
      </div>

      {/* Form field rows */}
      <div className="space-y-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-9 w-full rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
