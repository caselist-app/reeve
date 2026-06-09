'use client'

import { useActionState, useState, useId } from 'react'
import { createTourAction } from '@/lib/actions/tours'
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

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'CHF', 'DKK', 'NOK', 'SEK', 'JPY', 'NZD']

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function NewTourPage() {
  const formId = useId()
  const [state, formAction, pending] = useActionState(createTourAction, { error: null })
  const [artistAct, setArtistAct] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [currency, setCurrency] = useState('GBP')

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">New tour</h1>

      <form action={formAction} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Tour name</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            placeholder="European Spring 2026"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-artist_act`}>Artist / act</Label>
          <Input
            id={`${formId}-artist_act`}
            name="artist_act"
            value={artistAct}
            onChange={(e) => {
              setArtistAct(e.target.value)
              if (!slugTouched) setSlug(toSlug(e.target.value))
            }}
            placeholder="The Midnight"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Base currency</Label>
            <Select name="base_currency" value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${formId}-artist_slug`}>
              Slug
              <span className="ml-1 text-xs text-muted-foreground">for advancing@ email</span>
            </Label>
            <Input
              id={`${formId}-artist_slug`}
              name="artist_slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugTouched(true)
              }}
              placeholder="the-midnight"
            />
          </div>
        </div>

        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Creating...' : 'Create tour'}
        </Button>
      </form>
    </div>
  )
}
