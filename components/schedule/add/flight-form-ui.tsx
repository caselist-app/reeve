'use client'

// Small presentational pieces shared across the Add Flight wizard's steps
// (add-flight-form.tsx). Split out per Brief 32 Phase 2 alongside
// flight-form-helpers.ts: these render JSX, so they need their own file
// rather than living in the plain .ts helpers module.

import type { ReactNode } from 'react'
import { AirlineLogo } from '@/components/schedule/airline-logo'
import { Input } from '@/components/ui/input'

export function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-foreground">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

export type Airline = { iataCode: string | null; icaoCode: string | null; name: string }

export function FlightChips({
  airline,
  flightNumber,
  onEditAirline,
  onFlightNumberChange,
}: {
  airline: Airline | null
  flightNumber: string
  onEditAirline: () => void
  onFlightNumberChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onEditAirline}
        className="rounded-full border border-border px-2 py-1 text-[11px] hover:bg-muted/60"
      >
        {airline?.iataCode ?? airline?.name ?? 'Airline'}
      </button>
      <Input
        value={flightNumber}
        onChange={(e) => onFlightNumberChange(e.target.value.replace(/\D/g, ''))}
        placeholder="Number"
        className="h-6 w-20 text-xs"
      />
    </div>
  )
}
