'use client'

import { formatMoveDate } from '@/lib/schedule/date-move'

interface DateMoveNoticeProps {
  // The day the record is on now, or for an add form the day it was opened from.
  // `YYYY-MM-DD`.
  currentDate: string | null | undefined
  // What the date field currently holds: `YYYY-MM-DD` from a date input, or
  // `YYYY-MM-DDTHH:MM` from a datetime-local one. Only the calendar-date prefix
  // is compared.
  //
  // A datetime-local field bound to a timestamptz renders wall-clock time in the
  // tour's timezone (see toDatetimeLocal), and every currentDate passed here is a
  // tour-local calendar date, so the two are already in the same frame and no
  // conversion belongs in this component. Passing a raw UTC ISO string as `value`
  // would compare the wrong day at the edges.
  value: string | null | undefined
}

// Brief 36 Part 1 follow-up, and cheaper than the toast. When the date field
// moves off the day the TM is looking at, say so before they save rather than
// after: it turns a surprise into an expectation, and it is derived client state
// with no round trip.
//
// The toast still has to exist. This tells the TM what is about to happen, and
// only the server can tell them what did happen, including whether the day had to
// be added to the tour and whether a show's times came with it.
export function DateMoveNotice({ currentDate, value }: DateMoveNoticeProps) {
  if (!currentDate || !value) return null

  const target = value.slice(0, 10)
  if (target.length < 10 || target === currentDate) return null

  return (
    <p className="text-[11px] text-muted-foreground">
      This will move to {formatMoveDate(target)}.
    </p>
  )
}
