'use client'

import { useState, useTransition } from 'react'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { sendRider } from '@/lib/actions/documents'

export type SendableDocument = {
  id: string
  title: string
  doc_type: string
}

export type ContactablePerson = {
  id: string
  name: string
  contact_email: string
}

interface Props {
  tourId: string
  showId: string
  departmentLabel: string
  documents: SendableDocument[]
  people: ContactablePerson[]
  onSent: () => void
}

export function SendRiderSheet({
  tourId,
  showId,
  departmentLabel,
  documents,
  people,
  onSent,
}: Props) {
  const { close } = useSidePanel()

  // Panel unmounts between opens so initial state is always fresh.
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '')
  const [personId, setPersonId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSend() {
    if (!documentId || !personId) return
    setError(null)

    startTransition(async () => {
      const result = await sendRider({
        tourId,
        showId,
        documentId,
        recipientPersonId: personId,
        note: note.trim() || null,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setNote('')
        setPersonId('')
        close()
        onSent()
      }
    })
  }

  return (
    <PanelShell
      title={`Send ${departmentLabel} advance`}
      description="The recipient will receive an email with a tracked link to the document."
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
          <Label>Recipient</Label>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contacts with an email address on this tour.
            </p>
          ) : (
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger>
                <SelectValue placeholder="Select contact" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

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
          disabled={isPending || !documentId || !personId || documents.length === 0}
          className="w-full"
        >
          {isPending ? 'Sending...' : 'Send document'}
        </Button>
      </div>
    </PanelShell>
  )
}
