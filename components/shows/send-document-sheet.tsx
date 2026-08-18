'use client'

import { useState, useTransition, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { sendDocument } from '@/lib/actions/documents'
import { recipientEmailSchema } from '@/lib/validators/documents'

// Re-exported for existing importers. The shape itself lives in
// lib/shows/advance.ts, which server code can import and this file cannot be.
import type { SendableDocument } from '@/lib/shows/advance'

export type { SendableDocument }

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
  onSent: () => void
}

// REE-283: recipients are freeform email addresses, not roster picks. A venue
// or promoter contact receiving a rider is rarely crew, so forcing the TM to
// add them to the roster first was the wrong door. Typed like a tag input:
// Enter or comma commits the current text as a chip after validating it.
export function SendDocumentSheet({
  tourId,
  showId,
  shows = [],
  departmentLabel,
  documents,
  onSent,
}: Props) {
  const { close } = useSidePanel()

  // Panel unmounts between opens so initial state is always fresh.
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '')
  const [emails, setEmails] = useState<string[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [selectedShowId, setSelectedShowId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Parses the current input against `emails` without touching state, so a
  // caller can get the fully up-to-date list synchronously: setEmails inside
  // an event handler doesn't take effect until the next render, so reading
  // `emails` right after calling a state-setting commit would still see the
  // stale array.
  function parseEmailInput(): { emails: string[]; error: string | null } {
    const raw = emailInput.trim()
    if (!raw) return { emails, error: null }

    const parsed = recipientEmailSchema.safeParse(raw)
    if (!parsed.success) {
      return { emails, error: parsed.error.issues[0]?.message ?? 'Enter a valid email address' }
    }

    const next = emails.includes(parsed.data) ? emails : [...emails, parsed.data]
    return { emails: next, error: null }
  }

  function commitEmailInput() {
    const { emails: next, error: parseError } = parseEmailInput()
    if (parseError) {
      setEmailError(parseError)
      return
    }
    setEmailError(null)
    setEmails(next)
    setEmailInput('')
  }

  function removeEmail(email: string) {
    setEmails((prev) => prev.filter((e) => e !== email))
  }

  function handleEmailKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitEmailInput()
    } else if (e.key === 'Backspace' && emailInput === '' && emails.length > 0) {
      removeEmail(emails[emails.length - 1])
    }
  }

  function handleSend() {
    // A valid address left uncommitted in the input still counts as intent
    // to send to it, so fold it into the list before checking whether
    // there's anything to send.
    const { emails: finalEmails, error: parseError } = parseEmailInput()
    if (parseError) {
      setEmailError(parseError)
      return
    }

    setError(null)

    if (!documentId || finalEmails.length === 0) {
      setError('Add at least one recipient.')
      return
    }

    setEmails(finalEmails)
    setEmailInput('')

    startTransition(async () => {
      const result = await sendDocument({
        tourId,
        showId: showId ?? (selectedShowId || null),
        documentId,
        recipientEmails: finalEmails,
        note: note.trim() || null,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setNote('')
        setEmails([])
        setEmailInput('')
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
          <div
            className={cn(
              'flex flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5',
              emailError && 'border-destructive'
            )}
          >
            {emails.map((email) => (
              <span
                key={email}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
              >
                {email}
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="email"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value)
                if (emailError) setEmailError(null)
              }}
              onKeyDown={handleEmailKeyDown}
              onBlur={commitEmailInput}
              placeholder={emails.length === 0 ? 'name@venue.com' : ''}
              className="min-w-[10rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {emailError && <p className="text-xs text-destructive">{emailError}</p>}
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

        {/* Counts an uncommitted address still sitting in the input too: handleSend
            folds it into the list, so disabling on emails.length alone would trap a
            TM who typed an address and clicked Send without pressing Enter first. */}
        <Button
          onClick={handleSend}
          disabled={
            isPending ||
            !documentId ||
            (emails.length === 0 && emailInput.trim() === '') ||
            documents.length === 0
          }
          className="w-full"
        >
          {isPending ? 'Sending...' : `Send to ${emails.length} recipient${emails.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </PanelShell>
  )
}
