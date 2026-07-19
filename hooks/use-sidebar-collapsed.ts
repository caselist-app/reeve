'use client'

import { useState, useCallback } from 'react'

const COOKIE_KEY = 'reeve:sidebar-collapsed'

function persist(collapsed: boolean) {
  document.cookie = `${COOKIE_KEY}=${collapsed ? '1' : '0'}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

// Mirrors useSidebarWidth's pattern: initial value comes from a server-read
// cookie passed in as a prop, seeded synchronously into useState, so SSR
// output and first client render agree and there's no flash on reload.
export function useSidebarCollapsed(initialCollapsed: boolean) {
  const [collapsed, setCollapsedState] = useState(initialCollapsed)

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    persist(value)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev
      persist(next)
      return next
    })
  }, [])

  return { collapsed, setCollapsed, toggleCollapsed }
}
