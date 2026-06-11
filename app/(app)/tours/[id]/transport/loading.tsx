export default function TransportLoading() {
  return (
    <div className="flex flex-col gap-4 p-8 animate-pulse">
      <div className="h-7 w-28 rounded-lg bg-muted" />
      <div className="h-5 w-52 rounded bg-muted" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
