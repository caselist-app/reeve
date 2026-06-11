'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Home, MapPin, ArrowRight, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { resolveHomeCity } from '@/lib/actions/planner'

interface DepartureSelectorProps {
  // Current departure display label and resolved IATA (for highlighting active option).
  current: { label: string; iata: string }
  // Prior show — null if this is the first show or no resolved hub.
  priorShow: { venue_name: string | null; date: string; hub: string } | null
  // Selected person's home city.
  homeCity: string | null
  // null = revert to auto-resolution (home city via getFromHub).
  onSelect: (iata: string | null) => void
}

export function DepartureSelector({
  current,
  priorShow,
  homeCity,
  onSelect,
}: DepartureSelectorProps) {
  const [open, setOpen] = useState(false)
  const [customCity, setCustomCity] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handlePrior() {
    if (!priorShow) return
    onSelect(priorShow.hub)
    setOpen(false)
  }

  function handleHome() {
    onSelect(null) // null = auto-resolve from home city
    setOpen(false)
  }

  function handleCustomSubmit() {
    if (!customCity.trim()) return
    setCustomError(null)
    startTransition(async () => {
      const result = await resolveHomeCity(customCity.trim())
      if (result.iata) {
        onSelect(result.iata)
        setOpen(false)
        setCustomCity('')
      } else {
        setCustomError('Could not find an airport near that city.')
      }
    })
  }

  const priorDate = priorShow
    ? new Date(`${priorShow.date}T00:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : null

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 font-semibold hover:text-foreground/70 transition-colors">
          {current.label}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-72 p-2" align="start">
        <p className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Departing from
        </p>

        {/* Previous show */}
        {priorShow && (
          <button
            onClick={handlePrior}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted',
              current.iata === priorShow.hub && 'bg-muted'
            )}
          >
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {priorShow.venue_name ?? 'Previous show'}
              </p>
              <p className="text-xs text-muted-foreground">
                {priorDate} &nbsp;·&nbsp; {priorShow.hub}
              </p>
            </div>
          </button>
        )}

        {/* Home */}
        <button
          onClick={handleHome}
          className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
        >
          <Home className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Home</p>
            <p className="text-xs text-muted-foreground">
              {homeCity ?? 'No home city set'}
            </p>
          </div>
        </button>

        {/* Custom city */}
        <div className="mt-1 border-t pt-2 px-3 pb-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm font-medium">Somewhere else</p>
          </div>
          <Input
            placeholder="Any city or airport…"
            value={customCity}
            onChange={(e) => {
              setCustomCity(e.target.value)
              setCustomError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
            className="h-8 text-sm"
          />
          {customError && (
            <p className="text-xs text-destructive">{customError}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs"
            onClick={handleCustomSubmit}
            disabled={isPending || !customCity.trim()}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              'Use this city'
            )}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
