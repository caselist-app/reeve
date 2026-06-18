'use client'

import { useState, useId, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTourAction } from '@/lib/actions/tours'
import { createArtistAction } from '@/lib/actions/artists'
import { TOUR_TIMEZONES } from '@/lib/validators/tour'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NEW_ARTIST = '__new__'
const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'CHF', 'DKK', 'NOK', 'SEK', 'JPY', 'NZD']

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface Artist {
  id: string
  name: string
  slug: string | null
}

interface Props {
  artists: Artist[]
}

export function NewTourForm({ artists }: Props) {
  const formId = useId()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [artistId, setArtistId] = useState(artists.length === 1 ? artists[0].id : '')
  const [newArtistName, setNewArtistName] = useState('')
  const [newArtistSlug, setNewArtistSlug] = useState('')
  const [currency, setCurrency] = useState('GBP')
  const [timezone, setTimezone] = useState('')

  const isNewArtist = artistId === NEW_ARTIST

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      let resolvedArtistId = artistId

      // Create the artist first if the TM is adding a new one.
      if (isNewArtist) {
        const artistData = new FormData()
        artistData.set('name', newArtistName)
        artistData.set('slug', newArtistSlug)
        const result = await createArtistAction({ error: null }, artistData)
        if (result.error || !result.artistId) {
          setError(result.error ?? 'Failed to create artist')
          return
        }
        resolvedArtistId = result.artistId
      }

      formData.set('artist_id', resolvedArtistId)
      const result = await createTourAction({ error: null }, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      // createTourAction redirects on success; if we get here something went wrong.
      router.push('/')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label>Artist</Label>
        <Select value={artistId} onValueChange={setArtistId} required>
          <SelectTrigger>
            <SelectValue placeholder="Select artist" />
          </SelectTrigger>
          <SelectContent>
            {artists.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
            <SelectItem value={NEW_ARTIST}>+ New artist</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isNewArtist && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-new-artist-name`}>Artist name</Label>
            <Input
              id={`${formId}-new-artist-name`}
              value={newArtistName}
              onChange={(e) => {
                setNewArtistName(e.target.value)
                setNewArtistSlug(toSlug(e.target.value))
              }}
              placeholder="Tesseract"
              required={isNewArtist}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Slug
              <span className="ml-1 text-xs text-muted-foreground">for advancing@ email</span>
            </Label>
            <Input
              value={newArtistSlug}
              readOnly
              disabled
              className="cursor-default"
              placeholder="derived from artist name"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${formId}-name`}>Tour name</Label>
        <Input
          id={`${formId}-name`}
          name="name"
          placeholder="European Spring 2026"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-start_date`}>Start date</Label>
          <Input id={`${formId}-start_date`} name="start_date" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-end_date`}>End date</Label>
          <Input id={`${formId}-end_date`} name="end_date" type="date" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-territory`}>Territory</Label>
        <Input id={`${formId}-territory`} name="territory" placeholder="Europe, UK" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Base currency</Label>
          <Select name="base_currency" value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>
            Timezone
            <span className="ml-1 text-xs text-muted-foreground">for day sheet times</span>
          </Label>
          <Select name="timezone" value={timezone} onValueChange={setTimezone}>
            <SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {TOUR_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating...' : 'Create tour'}
      </Button>
    </form>
  )
}
