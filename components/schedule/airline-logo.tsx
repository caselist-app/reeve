'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// AirLabs serves airline logos from a static, IATA-code-keyed URL - no API
// call, so it never touches the AirLabs quota. Not every code has a logo on
// their CDN, so a failed load just hides the image rather than showing a
// broken-image icon. Shared by the Add Flight flow, the schedule timeline
// card, and the flight edit panel.
interface AirlineLogoProps {
  iataCode: string | null
  size?: 's' | 'm'
  className?: string
}

const SIZE_CLASS: Record<NonNullable<AirlineLogoProps['size']>, string> = {
  s: 'h-3.5 w-3.5',
  m: 'h-6 w-6',
}

export function AirlineLogo({ iataCode, size = 's', className }: AirlineLogoProps) {
  const [failed, setFailed] = useState(false)
  if (!iataCode || failed) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable third-party CDN path.
    <img
      src={`https://airlabs.co/img/airline/${size}/${iataCode}.png`}
      alt=""
      className={cn('shrink-0 rounded-sm object-contain', SIZE_CLASS[size], className)}
      onError={() => setFailed(true)}
    />
  )
}
