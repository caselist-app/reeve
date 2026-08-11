'use client'

import { Plus } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'

interface AddVenueButtonProps {
  tourId: string
  tourDateId: string
  date: string
  notes: string | null
}

// The action on a show day that has no show row yet. Opens edit-day with
// hasShow=false, which hands off to ShowForm (the same path add uses since
// REE-90), so this is how a venue gets added to an existing show day. The day
// type is always 'show' here: that is the only day type that reaches
// needs-venue in venueSectionState.
export function AddVenueButton({ tourId, tourDateId, date, notes }: AddVenueButtonProps) {
  const { open } = useSidePanel()

  return (
    <button
      type="button"
      onClick={() =>
        open({
          type: 'edit-day',
          tourId,
          tourDateId,
          date,
          dayType: 'show',
          notes,
          hasShow: false,
        })
      }
      className="mt-1.5 flex items-center gap-1.5 rounded-md text-xs font-medium text-foreground transition-colors hover:text-primary"
    >
      <Plus className="h-3.5 w-3.5" />
      Add the venue
    </button>
  )
}
