'use client'

import { useState, useId, useTransition } from 'react'
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
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')

  // Navigating from a render-body side effect (the previous useActionState
  // version called router.push directly whenever state.artistId was truthy)
  // races the revalidatePath the server action just issued: the push can
  // fire before Next.js has committed the invalidation, serving /tours/new
  // a stale Router Cache snapshot missing the new artist (REE-261). Routing
  // from inside the transition, after the action's promise has resolved,
  // is the pattern every other form in this app uses (useEntityForm,
  // new-tour-form.tsx) and keeps the push strictly after the revalidation.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createArtistAction({ error: null }, formData)
      if (result.error || !result.artistId) {
        setError(result.error ?? 'Failed to create artist')
        return
      }
      router.push('/tours/new')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating...' : 'Create artist'}
      </Button>
    </form>
  )
}
