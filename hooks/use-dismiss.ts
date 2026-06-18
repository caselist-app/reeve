import { useEffect, type RefObject } from 'react'

interface UseDismissOptions<T extends HTMLElement> {
  isOpen: boolean
  onClose: () => void
  ref: RefObject<T | null>
}

// Closes an open layer on Escape or a pointer-down outside `ref`. For bespoke
// overlays that intentionally are not Radix primitives (such as the in-sidebar
// settings slide-over), so the dismiss logic lives in one tested place rather
// than being hand-rolled per component. Listeners attach only while open.
export function useDismiss<T extends HTMLElement>({ isOpen, onClose, ref }: UseDismissOptions<T>) {
  useEffect(() => {
    if (!isOpen) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }

    window.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen, onClose, ref])
}
