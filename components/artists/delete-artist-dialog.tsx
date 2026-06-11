'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteArtistAction } from '@/lib/actions/artists'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

interface Props {
  artistId: string
  artistName: string
  tourCount: number
}

export function DeleteArtistDialog({ artistId, artistName, tourCount }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isConfirmed = confirmation === artistName

  function handleDelete() {
    if (!isConfirmed) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteArtistAction(artistId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) setConfirmation('')
  }

  const tourLabel =
    tourCount === 0
      ? 'all associated data'
      : tourCount === 1
      ? '1 tour and all its data'
      : `${tourCount} tours and all their data`

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete artist
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {artistName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong className="text-foreground">{artistName}</strong>{' '}
            and {tourLabel}. Shows, people, transport, hotels, documents -- everything. This cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-1">
          <Label htmlFor="confirm-artist-name">
            Type <strong>{artistName}</strong> to confirm
          </Label>
          <Input
            id="confirm-artist-name"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={artistName}
            autoComplete="off"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <button
            onClick={handleDelete}
            disabled={!isConfirmed || pending}
            className={cn(
              buttonVariants({ variant: 'destructive' }),
              (!isConfirmed || pending) && 'pointer-events-none opacity-50',
            )}
          >
            {pending ? 'Deleting...' : 'Delete forever'}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
