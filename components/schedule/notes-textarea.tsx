'use client'

import { useRef, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { updateDayNotes } from '@/lib/actions/tour-dates'

interface NotesTextareaProps {
  tourId: string
  date: string
  initialValue: string
}

// Saves on blur. No save button.
//
// One writer, whether or not the day has a show on it. It used to branch on
// showId and write two different tables, which is how a TM ended up with a note
// the Dates sidebar could not see. See Brief 36 Part 4.
export function NotesTextarea({ tourId, date, initialValue }: NotesTextareaProps) {
  const [, startTransition] = useTransition()
  const lastSaved = useRef(initialValue)

  function handleBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    const value = e.currentTarget.value
    if (value === lastSaved.current) return

    startTransition(async () => {
      const result = await updateDayNotes(tourId, date, value)
      if (result.error) {
        toast.error(result.error)
        return
      }
      lastSaved.current = value
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
