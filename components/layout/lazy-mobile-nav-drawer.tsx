'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useMobileNav } from '@/stores/mobile-nav-store'

const MobileNavDrawer = dynamic(
  () => import('@/components/layout/mobile-nav-drawer').then((mod) => mod.MobileNavDrawer),
  { ssr: false },
)

interface Tour {
  id: string
  name: string
  artist_id: string
  artist_name: string
}

interface LazyMobileNavDrawerProps {
  tours: Tour[]
  lastTourId?: string | null
  openItemCount?: number
}

// Keeps the Radix Dialog out of the app shell bundle (REE-267). Mounted
// unconditionally by AppLayout on every authenticated page, so it only loads
// the real drawer once MobileTopBar's hamburger has opened it, same
// hasOpened gate as LazyCommandPalette.
export function LazyMobileNavDrawer({ tours, lastTourId, openItemCount }: LazyMobileNavDrawerProps) {
  const { isOpen } = useMobileNav()
  const [hasOpened, setHasOpened] = useState(false)

  useEffect(() => {
    if (isOpen) setHasOpened(true)
  }, [isOpen])

  if (!isOpen && !hasOpened) return null

  return (
    <MobileNavDrawer
      tours={tours}
      lastTourId={lastTourId}
      openItemCount={openItemCount}
    />
  )
}
