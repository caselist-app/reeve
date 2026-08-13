'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

interface SidebarLogoProps {
  collapsed: boolean
}

// Reeve mark, centred at the bottom of the sidebar rail (REE-165). Each
// asset is pre-coloured for the background it sits on (dark rail vs light
// rail), so this only has to pick a file, not tint anything. Uses
// resolvedTheme (not theme) so a 'system' preference still resolves to an
// actual light/dark asset rather than rendering neither.
export function SidebarLogo({ collapsed }: SidebarLogoProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="h-8" aria-hidden="true" />

  const isDark = resolvedTheme === 'dark'

  if (collapsed) {
    return (
      <Image
        src={isDark ? '/logo/reeve-mark-dark.png' : '/logo/reeve-mark-light.png'}
        alt="Reeve"
        width={29}
        height={24}
        className="h-6 w-auto"
      />
    )
  }

  return (
    <Image
      src={isDark ? '/logo/reeve-full-dark.png' : '/logo/reeve-full-light.png'}
      alt="Reeve"
      width={84}
      height={32}
      className="h-8 w-auto"
    />
  )
}
