'use client'

import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 767

// Returns true when the viewport is below the md breakpoint (767px).
// Defaults to false on the server so the first paint uses the desktop layout,
// avoiding an SSR mismatch. Only use this for component swaps that CSS classes
// cannot express (e.g. rendering a Sheet instead of an inline panel).
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}
