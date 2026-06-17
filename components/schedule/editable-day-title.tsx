'use client'

import { useRef, useState, useTransition } from 'react'
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

  const titleClasses = 'text-3xl font-bold tracking-tight text-foreground'

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
    <h1
      onClick={() => setEditing(true)}
      title="Click to rename this day"
      className={cn(
        titleClasses,
        '-mx-1 cursor-text rounded px-1 transition-colors hover:bg-muted/50',
      )}
    >
      {display}
    </h1>
  )
}
