'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createShow } from '@/lib/actions/shows'

interface AddShowFormProps {
  tourId: string
  date: string
  onBack: () => void
  onSuccess: () => void
}

export function AddShowForm({ tourId, date, onBack, onSuccess }: AddShowFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createShow(tourId, {
        date,
        venue_name: fd.get('venue_name') as string,
        address:    (fd.get('address') as string) || null,
        load_in_at: (fd.get('load_in_at') as string) || null,
        curfew_at:  (fd.get('curfew_at') as string) || null,
      })
      if (result.error) { setError(result.error); return }
      router.refresh()
      onSuccess()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Venue name</Label>
        <Input name="venue_name" placeholder="The Roundhouse" required className="h-7 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Address</Label>
        <Input name="address" placeholder="Chalk Farm Rd, London NW1 8EH" className="h-7 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Load-in</Label>
          <Input name="load_in_at" type="datetime-local" defaultValue={`${date}T10:00`} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Curfew</Label>
          <Input name="curfew_at" type="datetime-local" defaultValue={`${date}T23:00`} className="h-7 text-xs" />
        </div>
      </div>
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
