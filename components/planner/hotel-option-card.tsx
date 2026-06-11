'use client'

import { useState, useTransition } from 'react'
import { Star, ParkingCircle, Clock, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { recordHotelOption } from '@/lib/actions/hotels'
import type { HotelOption } from '@/lib/logistics/types'

interface Person {
  id: string
  name: string
  person_type: string
}

interface HotelOptionCardProps {
  option: HotelOption
  tourId: string
  showId: string
  people: Person[]
  onRecorded?: (stayId: string) => void
}

export function HotelOptionCard({
  option,
  tourId,
  showId,
  people,
  onRecorded,
}: HotelOptionCardProps) {
  const [pending, startTransition] = useTransition()
  const [recorded, setRecorded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const artistPeople = people.filter((p) => p.person_type === 'artist')
  const crewPeople = people.filter((p) =>
    ['crew', 'management', 'support'].includes(p.person_type)
  )

  function handleRecord() {
    startTransition(async () => {
      setError(null)
      const result = await recordHotelOption(
        tourId,
        showId,
        option,
        {
          artist_people: option.tier === 'artist' ? artistPeople.map((p) => p.id) : [],
          crew_people: option.tier === 'crew' ? crewPeople.map((p) => p.id) : [],
        }
      )
      if (result.error) {
        setError(result.error)
      } else {
        setRecorded(true)
        if (result.stayId && onRecorded) onRecorded(result.stayId)
      }
    })
  }

  return (
    <div className={cn(
      'rounded-lg border p-4 text-sm transition-colors',
      recorded && 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10'
    )}>
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight">{option.property}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{option.address}</p>
        </div>
        {option.stars != null && (
          <div className="flex shrink-0 items-center gap-0.5 text-amber-400">
            {Array.from({ length: option.stars }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-current" />
            ))}
          </div>
        )}
      </div>

      {/* Flags */}
      <div className="mb-3 flex flex-wrap gap-2">
        {option.parking_ok && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <ParkingCircle className="h-3 w-3" />
            Parking OK
          </span>
        )}
        {option.early_check_in_ok && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Early check-in
          </span>
        )}
        {!option.early_check_in_ok && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Clock className="h-3 w-3" />
            Standard check-in only
          </span>
        )}
      </div>

      {/* Actions */}
      {error && (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex items-center gap-2">
        {recorded ? (
          <span className="text-xs text-green-700 dark:text-green-400">Recorded</span>
        ) : (
          <Button size="sm" variant="outline" onClick={handleRecord} disabled={pending}>
            {pending ? 'Recording...' : 'Record'}
          </Button>
        )}
        {option.book_url && (
          <a
            href={option.book_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Book
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}
