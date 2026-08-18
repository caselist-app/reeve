'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Archive, ArchiveRestore } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { archiveDocument, unarchiveDocument } from '@/lib/actions/documents'

interface Props {
  documentId: string
  title: string
  archived: boolean
}

const iconButtonClasses =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground'

// Archiving hides a document from every section it's currently in, so it
// confirms first. Unarchiving only puts it back where it was, so it doesn't.
export function ArchiveDocumentButton({ documentId, title, archived }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [, startTransition] = useTransition()

  if (archived) {
    return (
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            const result = await unarchiveDocument(documentId)
            if (result.error) toast.error(result.error)
          })
        }
        aria-label={`Unarchive ${title}`}
        className={iconButtonClasses}
      >
        <ArchiveRestore className="h-4 w-4" />
      </button>
    )
  }

  async function handleArchive(): Promise<string | null> {
    const result = await archiveDocument(documentId)
    return result.error
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label={`Archive ${title}`}
        className={iconButtonClasses}
      >
        <Archive className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Archive "${title}"?`}
        description="This moves the document to the Archived section. Nothing is deleted, and it can be restored any time."
        confirmLabel="Archive"
        pendingLabel="Archiving..."
        onConfirm={handleArchive}
      />
    </>
  )
}
