'use client'

import { useActionState, useState, useId } from 'react'
import { createArtistAndGoToNewTourAction } from '@/lib/actions/artists'
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
  // createArtistAndGoToNewTourAction redirects server-side on success, the
  // same pattern createTourAction uses. A client-side router.push after the
  // action resolved (tried during REE-261) left /tours/new intermittently
  // stuck on its loading.tsx fallback in e2e: the RSC payload had already
  // arrived, but the client-triggered navigation never committed it. Letting
  // the redirect live in the action's own response sidesteps that.
  const [state, formAction, pending] = useActionState(createArtistAndGoToNewTourAction, {
    error: null,
  })
  const [slug, setSlug] = useState('')

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
