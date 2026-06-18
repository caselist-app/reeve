import Link from 'next/link'
import { Plane, Train, Bus, Truck, Car } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge, TRANSPORT_VARIANT } from '@/components/ui/status-badge'
import type { Tables } from '@/lib/types/database'

export interface SegmentWithContext extends Tables<'transport_segments'> {
  assigned_count: number
  show_id: string | null
}

interface SegmentRowProps {
  segment: SegmentWithContext
  tourId: string
  timezone: string
}

const MODE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  flight: Plane,
  rail: Train,
  bus: Bus,
  truck: Truck,
  ground: Car,
  hire: Car,
}

function formatDateTime(iso: string | null, timezone: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
    hour12: false,
  })
  return { date, time }
}

function formatRoute(segment: SegmentWithContext): string {
  const { origin, destination, vehicle_or_flight_no } = segment
  if (origin && destination) {
    const route = `${origin} → ${destination}`
    return route.length > 40 ? route.slice(0, 37) + '...' : route
  }
  if (origin) return origin
  if (destination) return destination
  return vehicle_or_flight_no ?? 'Unknown route'
}

function formatCarrier(segment: SegmentWithContext): string {
  const { carrier_operator, vehicle_or_flight_no, booking_reference } = segment
  const parts: string[] = []
  if (carrier_operator) parts.push(carrier_operator)
  if (vehicle_or_flight_no) parts.push(vehicle_or_flight_no)
  if (booking_reference) parts.push(booking_reference)
  return parts.join(' · ')
}

export function SegmentRow({ segment, tourId, timezone }: SegmentRowProps) {
  const Icon = MODE_ICON[segment.mode] ?? Car
  const isCancelled = segment.status === 'cancelled'

  const depart = formatDateTime(segment.depart_at, timezone)
  const arrive = formatDateTime(segment.arrive_at, timezone)

  const timeRange = depart.time
    ? `${depart.time} – ${arrive.time || '-'}`
    : '-'

  const dateLabel = depart.date || ''

  const plannerHref = segment.show_id
    ? `/tours/${tourId}/shows/${segment.show_id}/planner`
    : `/tours/${tourId}/shows`

  return (
    <tr
      className={cn(
        'border-b border-border/50 last:border-0',
        isCancelled && 'opacity-50'
      )}
    >
      {/* Mode icon */}
      <td className="py-3 pl-4 pr-2 w-8">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      </td>

      {/* Route */}
      <td className="py-3 pr-4 min-w-0">
        <span className={cn('text-sm font-medium', isCancelled && 'line-through')}>
          {formatRoute(segment)}
        </span>
      </td>

      {/* Date + times */}
      <td className="py-3 pr-4 whitespace-nowrap">
        <span className="text-sm text-muted-foreground">
          {dateLabel && `${dateLabel} · `}{timeRange}
        </span>
      </td>

      {/* Carrier + ref */}
      <td className="hidden sm:table-cell py-3 pr-4">
        <span className="text-sm text-muted-foreground">
          {formatCarrier(segment) || '-'}
        </span>
      </td>

      {/* People */}
      <td className="hidden sm:table-cell py-3 pr-4 whitespace-nowrap">
        {segment.assigned_count > 0 ? (
          <span className="text-sm text-muted-foreground">
            {segment.assigned_count} {segment.assigned_count === 1 ? 'person' : 'people'}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground/40">-</span>
        )}
      </td>

      {/* Status badge */}
      <td className="py-3 pr-4 whitespace-nowrap">
        <StatusBadge
          label={segment.status}
          variant={TRANSPORT_VARIANT[segment.status] ?? 'warning'}
          className="capitalize"
        />
      </td>

      {/* Planner link */}
      <td className="hidden sm:table-cell py-3 pr-4 whitespace-nowrap">
        <Link
          href={plannerHref}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Planner &rarr;
        </Link>
      </td>
    </tr>
  )
}
