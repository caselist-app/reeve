export default function ShowsLoading() {
  return (
    <div className="flex flex-col gap-4 p-8 animate-pulse">
      <div className="h-7 w-32 rounded-lg bg-muted" />
      <div className="h-5 w-56 rounded bg-muted" />
      <div className="mt-2 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
