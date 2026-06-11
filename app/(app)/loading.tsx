export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6 p-8 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-muted" />
      <div className="h-4 w-72 rounded bg-muted" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  )
}
