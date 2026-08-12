'use client'

import { useState, useTransition } from 'react'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { sendDocument } from '@/lib/actions/documents'

// Re-exported for existing importers. The shapes themselves live in
// lib/shows/advance.ts, which server code can import and this file cannot be.
import type { SendableDocument, ContactablePerson } from '@/lib/shows/advance'

export type { SendableDocument, ContactablePerson }

export type SendableShow = { id: string; label: string }

interface Props {
  tourId: string
  // Fixed and hidden from the picker when the caller already knows the show
  // (the advance panel). Left undefined for a tour-level send, where the show
  // field renders and defaults to "No show (tour-level send)".
  showId?: string
  shows?: SendableShow[]
  departmentLabel: string
  documents: SendableDocument[]
  people: ContactablePerson[]
  onSent: () => void
}

export function SendDocumentSheet({
  tourId,
  showId,
  shows = [],
  departmentLabel,
  documents,
  people,
  onSent,
}: Props) {
  const { close } = useSidePanel()

  // Panel unmounts between opens so initial state is always fresh.
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '')
  const [personIds, setPersonIds] = useState<string[]>([])
  const [selectedShowId, setSelectedShowId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function togglePerson(personId: string) {
    setPersonIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    )
  }

  function handleSend() {
    if (!documentId || personIds.length === 0) return
    setError(null)

    startTransition(async () => {
      const result = await sendDocument({
        tourId,
        showId: showId ?? (selectedShowId || null),
        documentId,
        recipientPersonIds: personIds,
        note: note.trim() || null,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setNote('')
        setPersonIds([])
        setSelectedShowId('')
        close()
        onSent()
      }
    })
  }

  return (
    <PanelShell
      title={`Send ${departmentLabel} advance`}
      description="Recipients receive an email with a tracked link to the document."
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label>Document</Label>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents uploaded for this department yet.
            </p>
          ) : (
            <Select value={documentId} onValueChange={setDocumentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select document" />
              </SelectTrigger>
              <SelectContent>
                {documents.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Recipients</Label>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts on this tour.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-md border border-input divide-y divide-border">
              {people.map((person) => {
                const unselectable = !person.contact_email
                return (
                  <label
                    key={person.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm',
                      unselectable
                        ? 'cursor-not-allowed text-muted-foreground/50'
                        : 'cursor-pointer hover:bg-muted/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={personIds.includes(person.id)}
                      disabled={unselectable}
                      onChange={() => togglePerson(person.id)}
                      className="h-4 w-4 shrink-0 rounded border-input accent-foreground disabled:cursor-not-allowed"
                    />
                    <span className="truncate">{person.name}</span>
                    {unselectable && (
                      <span className="ml-auto shrink-0 text-xs">No email</span>
                    )}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {!showId && (
          <div className="space-y-1.5">
            <Label>
              Show <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Select
              value={selectedShowId}
              onValueChange={(value) => setSelectedShowId(value === 'none' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No show (tour-level send)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No show (tour-level send)</SelectItem>
                {shows.map((show) => (
                  <SelectItem key={show.id} value={show.id}>
                    {show.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Attaching a show updates its advance status and schedules reminders.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>
            Note <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any context for the recipient..."
            rows={3}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleSend}
          disabled={isPending || !documentId || personIds.length === 0 || documents.length === 0}
          className="w-full"
        >
          {isPending ? 'Sending...' : `Send to ${personIds.length} people`}
        </Button>
      </div>
    </PanelShell>
  )
}
