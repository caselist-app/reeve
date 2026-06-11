'use client'

import { useRef, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateShowNotes } from '@/lib/actions/shows'
import { upsertDayNotes } from '@/lib/actions/day-events'

interface NotesTextareaProps {
  // Show day: pass showId. Non-show day: pass tourId + date.
  showId?: string
  tourId?: string
  date?: string
  initialValue: string
}

// Saves on blur. No save button. Debounced: waits 400ms after the last
// keystroke before the blur-triggered save fires, to avoid mid-edit saves.
export function NotesTextarea({ showId, tourId, date, initialValue }: NotesTextareaProps) {
  const [, startTransition] = useTransition()
  const lastSaved = useRef(initialValue)

  function handleBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    const value = e.currentTarget.value
    if (value === lastSaved.current) return
    lastSaved.current = value

    startTransition(async () => {
      if (showId) {
        await updateShowNotes(showId, value)
      } else if (tourId && date) {
        await upsertDayNotes(tourId, date, value)
      }
    })
  }

  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-md border border-border bg-transparent',
        'px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px]',
      )}
      placeholder="Add notes..."
      defaultValue={initialValue}
      onBlur={handleBlur}
    />
  )
}
