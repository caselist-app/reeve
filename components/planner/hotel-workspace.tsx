'use client'

import { useState, useTransition } from 'react'
import { planHotels } from '@/lib/logistics/hotels'
import { HotelOptionCard } from '@/components/planner/hotel-option-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { HotelOption } from '@/lib/logistics/types'

interface Person {
  id: string
  name: string
  person_type: string
}

interface Show {
  id: string
  tour_id: string
  venue_name: string
  date: string
  address: string | null
  venue_lat: number | null
  venue_lng: number | null
}

interface HotelWorkspaceProps {
  show: Show
  tourId: string
  people: Person[]
  defaultArriveAt: string | null
  defaultDepartAt: string | null
}

export function HotelWorkspace({
  show,
  tourId,
  people,
  defaultArriveAt,
  defaultDepartAt,
}: HotelWorkspaceProps) {
  const [crewCount, setCrewCount] = useState(
    people.filter((p) => ['crew', 'management', 'support'].includes(p.person_type)).length
  )
  const [artistCount, setArtistCount] = useState(
    people.filter((p) => p.person_type === 'artist').length
  )
  const [parkingRequired, setParkingRequired] = useState(false)
  const [arriveAt] = useState(defaultArriveAt)
  const [departAt] = useState(defaultDepartAt)

  const [results, setResults] = useState<{ artist: HotelOption[]; crew: HotelOption[] } | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Search is available if lat/lng is cached or an address is present.
  // planHotels geocodes on the fly when lat/lng is null but address is set.
  const geocoded = (show.venue_lat != null && show.venue_lng != null) || !!show.address

  function handleSearch() {
    setPlanError(null)
    setResults(null)
    startTransition(async () => {
      try {
        const res = await planHotels({
          show_id: show.id,
          party: {
            crew_count: crewCount,
            artist_count: artistCount,
            parking_required: parkingRequired,
          },
          arrive_at: arriveAt,
          depart_at: departAt,
          product_type: 'overnight',
        })
        setResults(res)
      } catch (err) {
        setPlanError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Context summary */}
      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-2">
          <div>
            <p className="text-xs text-muted-foreground">Venue</p>
            <p className="font-medium">{show.venue_name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Night of</p>
            <p className="font-medium">
              {new Date(`${show.date}T00:00:00`).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Arrive</p>
            <p className="font-medium">
              {arriveAt
                ? new Date(arriveAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                : 'Not set'}
              {arriveAt && new Date(arriveAt).getHours() < 6 && (
                <span className="ml-1 text-xs font-normal text-amber-600">early check-in needed</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Depart</p>
            <p className="font-medium">
              {departAt
                ? new Date(departAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                : 'Not set'}
            </p>
          </div>
        </div>
      </div>

      {/* Party controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Crew rooms</Label>
          <Input
            type="number"
            min={0}
            value={crewCount}
            onChange={(e) => setCrewCount(Number(e.target.value))}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Artist rooms</Label>
          <Input
            type="number"
            min={0}
            value={artistCount}
            onChange={(e) => setArtistCount(Number(e.target.value))}
            className="w-20"
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <input
            id="parking"
            type="checkbox"
            checked={parkingRequired}
            onChange={(e) => setParkingRequired(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="parking" className="text-sm font-normal">
            Bus/truck parking required
          </Label>
        </div>
        <Button
          onClick={handleSearch}
          disabled={isPending || !geocoded || (crewCount + artistCount === 0)}
        >
          {isPending ? 'Searching...' : 'Search hotels'}
        </Button>
      </div>

      {!geocoded && (
        <p className="text-sm text-muted-foreground">
          Hotel search unavailable, add a venue address to resolve the location first.
        </p>
      )}

      {planError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {planError}
        </p>
      )}

      {/* Results */}
      {results !== null && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Artist shortlist</h3>
            {results.artist.length === 0 ? (
              <p className="text-sm text-muted-foreground">No artist options found.</p>
            ) : (
              <div className="space-y-3">
                {results.artist.map((opt, i) => (
                  <HotelOptionCard
                    key={`artist-${i}`}
                    option={opt}
                    tourId={tourId}
                    showId={show.id}
                    people={people}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Crew shortlist</h3>
            {results.crew.length === 0 ? (
              <p className="text-sm text-muted-foreground">No crew options found.</p>
            ) : (
              <div className="space-y-3">
                {results.crew.map((opt, i) => (
                  <HotelOptionCard
                    key={`crew-${i}`}
                    option={opt}
                    tourId={tourId}
                    showId={show.id}
                    people={people}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
