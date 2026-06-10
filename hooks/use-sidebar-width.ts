'use client'

import { useState, useCallback, useRef } from 'react'

const COOKIE_KEY = 'reeve:sidebar-width'
const DEFAULT_WIDTH = 220
const MIN_WIDTH = 180
const MAX_WIDTH = 320

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function persist(width: number) {
  document.cookie = `${COOKIE_KEY}=${width}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

export function useSidebarWidth(initialWidth: number) {
  const [width, setWidthState] = useState(initialWidth)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const setWidth = useCallback((w: number) => {
    const clamped = clamp(w, MIN_WIDTH, MAX_WIDTH)
    setWidthState(clamped)
    persist(clamped)
  }, [])

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startX.current = e.clientX
      startWidth.current = width
      setIsDragging(true)

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX.current
        setWidth(startWidth.current + delta)
      }

      const onMouseUp = () => {
        setIsDragging(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }

      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [width, setWidth],
  )

  return { width, isDragging, onDragStart }
}
