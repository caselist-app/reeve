import { type ReactNode } from 'react'
import { MapPin, Navigation } from 'lucide-react'

interface ContextSummaryProps {
  // fromNode replaces the plain "From" text with a custom element (e.g. DepartureSelector).
  fromNode: ReactNode
  toHub: string | null
  venueName: string
  requiredSiteArrival: string | null
  timezone: string | null
  groundMin: number
}

function formatTime(iso: string, tz: string | null): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz ?? 'UTC',
  })
}

export function ContextSummary({
  fromNode,
  toHub,
  venueName,
  requiredSiteArrival,
  timezone,
  groundMin,
}: ContextSummaryProps) {
  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">From</p>
            {fromNode}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">To</p>
            <p className="font-medium">{toHub ?? 'Hub not resolved'}</p>
            <p className="text-xs text-muted-foreground">
              {venueName} (+{groundMin} min ground)
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Must arrive site by</p>
            <p className="font-medium">
              {requiredSiteArrival
                ? formatTime(requiredSiteArrival, timezone)
                : 'No load-in set'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
