'use client'

import { useState, useTransition } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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

interface SendRiderSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tourId: string
  showId: string
  departmentLabel: string
  documents: SendableDocument[]
  people: ContactablePerson[]
  // Called after a successful send so the parent can refresh share state.
  onSent: () => void
}

export function SendRiderSheet({
  open,
  onOpenChange,
  tourId,
  showId,
  departmentLabel,
  documents,
  people,
  onSent,
}: SendRiderSheetProps) {
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
        onOpenChange(false)
        onSent()
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="mb-6">
          <SheetTitle>Send {departmentLabel} advance</SheetTitle>
          <SheetDescription>
            The recipient will receive an email with a tracked link to the document.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          {/* Document selector */}
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

          {/* Recipient selector */}
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

          {/* Optional note */}
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
      </SheetContent>
    </Sheet>
  )
}
