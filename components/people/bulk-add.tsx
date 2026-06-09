'use client'

import { useState, useTransition } from 'react'
import { addPerson } from '@/lib/actions/people'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

// Parses "Chris Evans (FOH Engineer)" or "Chris Evans" from a single line.
function parseLine(line: string): { name: string; role?: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(.+?)\s*\((.+)\)\s*$/)
  if (match) {
    return { name: match[1].trim(), role: match[2].trim() }
  }
  return { name: trimmed }
}

interface Props {
  tourId: string
  onSuccess: () => void
}

export function BulkAdd({ tourId, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Reset state when closing
      setText('')
      setSummary(null)
      setError(null)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSummary(null)

    const entries = text
      .split('\n')
      .map(parseLine)
      .filter((e): e is { name: string; role?: string } => e !== null)

    if (entries.length === 0) {
      setError('No names found.')
      return
    }

    startTransition(async () => {
      let added = 0
      let firstError: string | null = null

      for (const entry of entries) {
        const result = await addPerson(tourId, {
          person_type: 'crew',
          name: entry.name,
          role: entry.role,
        })
        if (result.error) {
          if (!firstError) firstError = result.error
        } else {
          added++
        }
      }

      if (added === 0 && firstError) {
        setError(firstError)
        return
      }

      setSummary(
        `Added ${added} crew member${added === 1 ? '' : 's'}.` +
          (firstError ? ' Some entries could not be added.' : '')
      )
      setText('')
      onSuccess()
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Bulk add
      </Button>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Bulk add crew</SheetTitle>
          <SheetDescription>
            One name per line. Include a role in parentheses if you have it.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-text">Names</Label>
            <Textarea
              id="bulk-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Chris Evans (FOH Engineer)\nSarah Connor\nJohn Smith (Drum Tech)'}
              rows={12}
              className="font-mono text-sm"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {summary && <p className="text-sm text-muted-foreground">{summary}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={pending || !text.trim()}
          >
            {pending ? 'Adding...' : 'Add crew'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
