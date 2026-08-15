'use client'

import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { createIdentityDocument } from '@/lib/actions/identity-documents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  contactId: string
  onSuccess: () => void
  onCancel: () => void
}

type DocumentKind = 'passport' | 'visa'

// Inline add form for the Identity documents section of the contact panel
// (REE-199, Brief 45 step 4). Not a side panel: the side-panel store holds no
// panel stack, so opening one here would replace the contact panel this form
// needs to stay inside. `kind` is read from this component's own state rather
// than the submitted FormData, the same pattern contact-sheet.tsx uses for
// every Radix Select: the trigger has no name attribute PostgREST would read.
export function IdentityDocumentForm({ contactId, onSuccess, onCancel }: Props) {
  const formId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<DocumentKind>('passport')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isVisa = kind === 'visa'

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Choose a file to upload.')
      return
    }

    const fd = new FormData(e.currentTarget)
    fd.set('kind', kind)
    fd.set('file', file)
    setError(null)

    startTransition(async () => {
      const result = await createIdentityDocument(contactId, fd)
      if (result.error) {
        setError(result.error)
        return
      }
      toast('Document saved.')
      onSuccess()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-kind`}>Type</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
          <SelectTrigger id={`${formId}-kind`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="passport">Passport</SelectItem>
            <SelectItem value="visa">Visa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-file`}>File</Label>
        <input
          ref={fileInputRef}
          id={`${formId}-file`}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => fileInputRef.current?.click()}
        >
          {fileName ?? 'Choose file'}
        </Button>
        <p className="text-xs text-muted-foreground">PDF or photo, up to 10 MB.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-document_number`}>Document number</Label>
        <Input id={`${formId}-document_number`} name="document_number" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-issuing_country`}>Issuing country</Label>
        <Input id={`${formId}-issuing_country`} name="issuing_country" placeholder="GBR" />
        <p className="text-xs text-muted-foreground">Three letter country code.</p>
      </div>

      {isVisa && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-valid_for_country`}>Valid for</Label>
            <Input id={`${formId}-valid_for_country`} name="valid_for_country" placeholder="USA" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-visa_type`}>Visa type</Label>
            <Input id={`${formId}-visa_type`} name="visa_type" placeholder="P-2" />
          </div>
        </>
      )}

      {!isVisa && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-surname`}>Surname</Label>
            <Input id={`${formId}-surname`} name="surname" placeholder="SMITH" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-given_names`}>First names</Label>
            <Input id={`${formId}-given_names`} name="given_names" placeholder="JAMES EDWARD" />
          </div>
          <p className="col-span-full text-xs text-muted-foreground">Exactly as printed on the document.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-issue_date`}>Issue date</Label>
          <Input id={`${formId}-issue_date`} name="issue_date" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-expiry_date`}>Expiry date</Label>
          <Input id={`${formId}-expiry_date`} name="expiry_date" type="date" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-notes`}>Notes</Label>
        <Textarea id={`${formId}-notes`} name="notes" rows={2} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || !fileName}>
          {pending ? 'Saving...' : 'Save document'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
