'use client'

import { useActionState, useEffect, useState, useId } from 'react'
import { createArtistAction } from '@/lib/actions/artists'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function NewArtistForm() {
  const formId = useId()
  const [state, formAction, pending] = useActionState(createArtistAction, { error: null })
  const [slug, setSlug] = useState('')

  // A full browser navigation, not router.push or a server-side redirect()
  // inside the action: both were tried for REE-261 and both left /tours/new
  // stuck on the app/(app) loading.tsx fallback in e2e. Trace inspection of
  // the failing runs showed the RSC payload for /tours/new arriving over the
  // network in milliseconds either way, but the client never committing it,
  // which points at a same-layout Suspense boundary/action-redirect
  // interaction between two sibling pages under app/(app), not a caching or
  // timing issue. A hard navigation sidesteps that entirely.
  useEffect(() => {
    if (state.artistId) {
      window.location.href = '/tours/new'
    }
  }, [state.artistId])

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${formId}-name`}>Artist name</Label>
        <Input
          id={`${formId}-name`}
          name="name"
          placeholder="Tesseract"
          required
          onChange={(e) => setSlug(toSlug(e.target.value))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-slug`}>
          Slug
          <span className="ml-1 text-xs text-muted-foreground">for advancing@ email</span>
        </Label>
        <Input
          id={`${formId}-slug`}
          name="slug"
          value={slug}
          readOnly
          className="cursor-default"
          placeholder="derived from artist name"
        />
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating...' : 'Create artist'}
      </Button>
    </form>
  )
}
