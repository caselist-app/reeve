'use client'

import { useRef, useState, useTransition } from 'react'
import { PanelShell } from '@/components/layout/panel-shell'
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
import { useSidePanel } from '@/stores/side-panel-store'
import { uploadDocument } from '@/lib/actions/documents'
import { UPLOADABLE_SECTIONS } from '@/lib/documents/doc-types'

interface Props {
  tourId: string
  onSuccess: () => void
}

// Upload a new version of a rider (REE-3). A doc_type can already have
// versions on file, so this always adds a new one rather than replacing:
// uploadDocument resolves the next version number and marks it current.
export function UploadDocumentPanel({ tourId, onSuccess }: Props) {
  const { close } = useSidePanel()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [docType, setDocType] = useState('')
  const [title, setTitle] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!docType) {
      setError('Choose a document type.')
      return
    }
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    if (!file) {
      setError('Choose a file to upload.')
      return
    }

    setError(null)

    const formData = new FormData()
    formData.set('doc_type', docType)
    formData.set('title', title.trim())
    formData.set('file', file)

    startTransition(async () => {
      const result = await uploadDocument(tourId, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      onSuccess()
      close()
    })
  }

  return (
    <PanelShell title="Upload document" description="Add a new document, or a new version of one already on file.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="upload-doc-type">Document type</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger id="upload-doc-type">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              {UPLOADABLE_SECTIONS.map((section) => (
                <SelectItem key={section.docType} value={section.docType}>
                  {section.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="upload-doc-title">Title</Label>
          <Input
            id="upload-doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Tech Rider v3"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="upload-doc-file">File</Label>
          <input
            ref={fileInputRef}
            id="upload-doc-file"
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
          <p className="text-xs text-muted-foreground">PDF, JPEG, PNG or WebP, up to 10 MB.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Uploading...' : 'Upload'}
        </Button>
      </form>
    </PanelShell>
  )
}
