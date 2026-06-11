'use client'

import { useActionState, useState, useId } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [state, formAction, pending] = useActionState(createArtistAction, { error: null })
  const [slug, setSlug] = useState('')

  if (state.artistId) {
    router.push('/tours/new')
  }

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
          disabled
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
