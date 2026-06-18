'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createHotelStay } from '@/lib/actions/hotels'

interface AddHotelFormProps {
  tourId: string
  tourDateId: string
  date: string
  onBack: () => void
  onSuccess: () => void
}

export function AddHotelForm({ tourId, tourDateId, date, onBack, onSuccess }: AddHotelFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createHotelStay(tourId, {
        tour_date_id:   tourDateId,
        name:           (fd.get('name') as string) || null,
        address:        (fd.get('address') as string) || null,
        check_in_date:  (fd.get('check_in_date') as string) || null,
        check_in_time:  (fd.get('check_in_time') as string) || null,
        check_out_date: (fd.get('check_out_date') as string) || null,
        check_out_time: (fd.get('check_out_time') as string) || null,
      })
      if (result.error) { setError(result.error); return }
      router.refresh()
      onSuccess()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Hotel name</Label>
        <Input name="name" placeholder="Ace Hotel London" className="h-7 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Address</Label>
        <Input name="address" placeholder="100 Shoreditch High St" className="h-7 text-xs" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Check-in date</Label>
          <Input name="check_in_date" type="date" defaultValue={date} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Check-in time</Label>
          <Input name="check_in_time" type="time" defaultValue="15:00" className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Check-out date</Label>
          <Input name="check_out_date" type="date" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Check-out time</Label>
          <Input name="check_out_time" type="time" defaultValue="11:00" className="h-7 text-xs" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? 'Adding...' : 'Add hotel'}
        </Button>
      </div>
    </form>
  )
}
