'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteArtistAction } from '@/lib/actions/artists'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Props {
  artistId: string
  artistName: string
  tourCount: number
}

export function DeleteArtistDialog({ artistId, artistName, tourCount }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  const isConfirmed = confirmation === artistName

  async function handleDelete(): Promise<string | null> {
    try {
      await deleteArtistAction(artistId)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'Something went wrong'
    }
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
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="mr-2 h-4 w-4" />
        Delete artist
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={`Delete ${artistName}?`}
        description={
          <>
            This will permanently delete <strong className="text-foreground">{artistName}</strong>{' '}
            and {tourLabel}. Shows, people, transport, hotels, documents -- everything. This cannot
            be undone.
          </>
        }
        confirmLabel="Delete forever"
        pendingLabel="Deleting..."
        confirmDisabled={!isConfirmed}
        onConfirm={handleDelete}
      >
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
      </ConfirmDialog>
    </>
  )
}
