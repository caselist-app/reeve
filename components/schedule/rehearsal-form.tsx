'use client'

import { useTransition, useState, useId } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { updateRehearsal, deleteRehearsal } from '@/lib/actions/rehearsals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface RehearsalFormProps {
  tourId: string
  rehearsalId: string
  initialData: {
    location_name: string
    address: string | null
    google_maps_url: string | null
    start_at: string | null
    end_at: string | null
    notes: string | null
  }
  className?: string
}

// Formats a UTC timestamptz ISO string into the datetime-local input format (YYYY-MM-DDTHH:MM).
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

export function RehearsalForm({ tourId, rehearsalId, initialData, className }: RehearsalFormProps) {
  const formId = useId()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteRehearsal(rehearsalId)
    setDeleting(false)
    if (result.error) { setError(result.error); return }
    router.push(`/tours/${tourId}/schedule`)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateRehearsal(rehearsalId, {
        location_name: fd.get('location_name') as string,
        address: (fd.get('address') as string) || null,
        google_maps_url: (fd.get('google_maps_url') as string) || null,
        start_at: (fd.get('start_at') as string) || null,
        end_at: (fd.get('end_at') as string) || null,
        notes: (fd.get('notes') as string) || null,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setError(null)
      setSaved(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-5', className)}>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-location_name`}>Location</Label>
        <Input
          id={`${formId}-location_name`}
          name="location_name"
          defaultValue={initialData.location_name}
          placeholder="Metropolis Studios, London"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-address`}>Address</Label>
        <Input
          id={`${formId}-address`}
          name="address"
          defaultValue={initialData.address ?? ''}
          placeholder="70 Chiswick High Rd, London W4 1SY"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-google_maps_url`}>Google Maps link</Label>
        <Input
          id={`${formId}-google_maps_url`}
          name="google_maps_url"
          type="url"
          defaultValue={initialData.google_maps_url ?? ''}
          placeholder="https://maps.google.com/..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-start_at`}>Start</Label>
          <Input
            id={`${formId}-start_at`}
            name="start_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(initialData.start_at)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-end_at`}>End</Label>
          <Input
            id={`${formId}-end_at`}
            name="end_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(initialData.end_at)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-notes`}>Notes</Label>
        <Textarea
          id={`${formId}-notes`}
          name="notes"
          defaultValue={initialData.notes ?? ''}
          rows={3}
          placeholder="Full band, focus on new material from second half of set"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving...' : 'Save'}
      </Button>

      {saved && <p className="text-sm text-muted-foreground">Saved.</p>}

      <div className="border-t border-border pt-5">
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm">
              Delete rehearsal
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this rehearsal?</AlertDialogTitle>
              <AlertDialogDescription>
                The day reverts to travel or day off. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? 'Deleting...' : 'Delete rehearsal'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  )
}
