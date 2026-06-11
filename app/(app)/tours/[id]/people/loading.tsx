export default function PeopleLoading() {
  return (
    <div className="flex flex-col gap-4 p-8 animate-pulse">
      <div className="h-7 w-24 rounded-lg bg-muted" />
      <div className="h-5 w-48 rounded bg-muted" />
      <div className="mt-2 space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
