'use client'

import { useRef, useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateDayTitle } from '@/lib/actions/tour-dates'

interface EditableDayTitleProps {
  tourDateId: string
  customTitle: string | null
  // The derived per-type default, shown when there is no custom title.
  derivedTitle: string
}

// Click the H1 to override it. Blank reverts to the derived default. Saves on
// blur (or Enter); Escape cancels. Keeps optimistic local state so the title
// updates immediately, with the server action persisting custom_title.
export function EditableDayTitle({ tourDateId, customTitle, derivedTitle }: EditableDayTitleProps) {
  const [editing, setEditing] = useState(false)
  const [custom, setCustom] = useState(customTitle ?? '')
  const [, startTransition] = useTransition()
  const lastSaved = useRef(customTitle ?? '')

  const display = custom.trim() || derivedTitle

  function save(next: string) {
    const trimmed = next.trim()
    setCustom(trimmed)
    setEditing(false)
    if (trimmed === lastSaved.current) return
    lastSaved.current = trimmed
    startTransition(async () => {
      await updateDayTitle(tourDateId, trimmed || null)
    })
  }

  const titleClasses = 'text-2xl font-bold tracking-tight text-foreground lg:text-3xl'

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={custom}
        placeholder={derivedTitle}
        onBlur={(e) => save(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.currentTarget.value = custom
            e.currentTarget.blur()
          }
        }}
        className={cn(
          titleClasses,
          'w-full bg-transparent outline-none',
          'placeholder:text-muted-foreground/50',
        )}
      />
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <h1
        onClick={() => setEditing(true)}
        aria-label="Rename this day"
        className={cn(
          titleClasses,
          'min-w-0 -mx-1 cursor-text rounded px-1 transition-colors hover:bg-muted/50',
        )}
      >
        {display}
      </h1>
      {/* Touch devices have no hover, so expose an explicit edit control on mobile. */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Rename this day"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}
