import Link from 'next/link'
import { Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import type { Tables } from '@/lib/types/database'
import type { Json } from '@/lib/types/database'

export interface StayWithContext extends Tables<'hotel_stays'> {
  room_count: number
  show_id: string | null
}

interface StayRowProps {
  stay: StayWithContext
  tourId: string
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function deriveCity(stay: StayWithContext): string {
  if (stay.city) return stay.city
  if (stay.address) {
    const parts = stay.address.split(',').map((p) => p.trim()).filter(Boolean)
    // Return the last meaningful part (usually city or country).
    return parts[parts.length - 1] ?? ''
  }
  return ''
}

function hasParkingFlag(parkingJson: Json): boolean {
  if (!parkingJson || typeof parkingJson !== 'object' || Array.isArray(parkingJson)) return false
  const p = parkingJson as Record<string, unknown>
  // Handles both { ok: true } (recorded via planner) and { bus: true } (manual).
  return Object.values(p).some((v) => v === true)
}

export function StayRow({ stay, tourId }: StayRowProps) {
  const isConfirmed = !!stay.confirmation_number?.trim()
  const city = deriveCity(stay)
  const parking = hasParkingFlag(stay.parking_json)

  const detailsHref = stay.show_id
    ? `/tours/${tourId}/shows/${stay.show_id}/hotels/${stay.id}`
    : `/tours/${tourId}/shows`

  return (
    <tr className="border-b border-border/50 last:border-0">
      {/* Hotel name */}
      <td className="py-3 pl-4 pr-4 min-w-0">
        {stay.name ? (
          <span className="text-sm font-medium">{stay.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground italic">Unnamed property</span>
        )}
      </td>

      {/* City */}
      <td className="hidden sm:table-cell py-3 pr-4">
        <span className="text-sm text-muted-foreground">{city || '-'}</span>
      </td>

      {/* Check-in */}
      <td className="py-3 pr-4 whitespace-nowrap">
        <span className="text-sm text-muted-foreground">{formatDate(stay.check_in_date)}</span>
      </td>

      {/* Check-out */}
      <td className="hidden sm:table-cell py-3 pr-4 whitespace-nowrap">
        <span className="text-sm text-muted-foreground">{formatDate(stay.check_out_date)}</span>
      </td>

      {/* Rooms */}
      <td className="hidden sm:table-cell py-3 pr-4 whitespace-nowrap">
        {stay.room_count > 0 ? (
          <span className="text-sm text-muted-foreground">
            {stay.room_count} {stay.room_count === 1 ? 'room' : 'rooms'}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground/40">-</span>
        )}
      </td>

      {/* Parking indicator */}
      <td className="hidden sm:table-cell py-3 pr-4 w-8">
        {parking && (
          <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-label="Parking available" />
        )}
      </td>

      {/* Status badge */}
      <td className="py-3 pr-4 whitespace-nowrap">
        <StatusBadge
          label={isConfirmed ? 'Confirmed' : 'To confirm'}
          variant={isConfirmed ? 'success' : 'warning'}
        />
      </td>

      {/* Details link, more prominent when unconfirmed */}
      <td className="py-3 pr-4 whitespace-nowrap">
        <Link
          href={detailsHref}
          className={cn(
            'text-sm transition-colors',
            isConfirmed
              ? 'text-muted-foreground hover:text-foreground'
              : 'font-medium text-foreground hover:text-foreground/80'
          )}
        >
          Details &rarr;
        </Link>
      </td>
    </tr>
  )
}
