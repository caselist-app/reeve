'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Eye } from 'lucide-react'
import { getDocumentViewUrl } from '@/lib/actions/documents'

interface Props {
  documentId: string
  title: string
}

const iconButtonClasses =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground'

// Opens the document's file in a new tab via a short-lived signed URL, for
// any doc_type. Signed at click, never at render, so the URL is never stale
// by the time a TM lands on it.
export function ViewDocumentButton({ documentId, title }: Props) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await getDocumentViewUrl(documentId)
          if (result.error || !result.url) {
            toast.error(result.error ?? 'Could not open that document.')
            return
          }
          window.open(result.url, '_blank', 'noopener,noreferrer')
        })
      }
      aria-label={`View ${title}`}
      className={iconButtonClasses}
    >
      <Eye className="h-4 w-4" />
    </button>
  )
}
