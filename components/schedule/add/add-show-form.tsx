'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import { createShow } from '@/lib/actions/shows'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'

interface AddShowFormProps {
  tourId: string
  date: string
  onBack: () => void
  onSuccess: () => void
}

export function AddShowForm({ tourId, date, onBack, onSuccess }: AddShowFormProps) {
  const [address, setAddress] = useState('')
  const { submit, pending, error } = useEntityForm({
    refreshOnSuccess: true,
    onSuccess,
    action: (fd) => {
      const data = readForm(fd, {
        venue_name: 'requiredString',
        address: 'string',
      })
      return createShow(tourId, { date, ...data })
    },
  })

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Venue name</Label>
        <Input name="venue_name" placeholder="The Roundhouse" required className="h-7 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Address</Label>
        <PlacesAddressInput
          name="address"
          value={address}
          onChange={setAddress}
          placeholder="Chalk Farm Rd, London NW1 8EH"
          className="h-7 text-xs"
        />
      </div>
      {/* Brief 36 step 3: no load-in or curfew here. They are day-sheet fields
          now, and this form used to default them to 10:00 and 23:00 and write
          them to columns nothing on the day view could edit, so the times a TM
          saw on the timeline and the times the crew were sent came apart from the
          moment the show was created. The show lands with no times and the TM
          sets them on the timeline, which is where they already edit them. */}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? 'Adding...' : 'Add show'}
        </Button>
      </div>
    </form>
  )
}
