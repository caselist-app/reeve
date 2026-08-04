'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useCommandPalette } from '@/stores/command-palette-store'

const CommandPalette = dynamic(
  () => import('@/components/nav/command-palette').then((mod) => mod.CommandPalette),
  { ssr: false },
)

// Keeps the Radix Dialog, Lucide search icons, and palette search UI out of the
// initial app shell bundle. The full palette loads only after the user opens it.
export function LazyCommandPalette() {
  const { open, togglePalette } = useCommandPalette()
  const [hasOpened, setHasOpened] = useState(false)

  useEffect(() => {
    if (open) setHasOpened(true)
  }, [open])

  useEffect(() => {
    if (hasOpened) return

    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setHasOpened(true)
        togglePalette()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [hasOpened, togglePalette])

  if (!open && !hasOpened) return null
  return <CommandPalette />
}
