'use client'

import { useRef, useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { renameDocument } from '@/lib/actions/documents'

interface DocumentTitleProps {
  documentId: string
  title: string
}

// Click the title to rename it. Blank or whitespace-only reverts to the last
// saved title. Saves on blur (or Enter) via renameDocument, only when the
// trimmed value changed; Escape reverts the input and cancels. Keeps
// optimistic local state so the title updates immediately, and toasts on a
// failed save rather than reverting it. Modeled on
// components/schedule/editable-day-title.tsx.
export function DocumentTitle({ documentId, title }: DocumentTitleProps) {
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(title)
  const [, startTransition] = useTransition()
  const lastSaved = useRef(title)

  function save(next: string) {
    const trimmed = next.trim()
    const value = trimmed || lastSaved.current
    setCurrent(value)
    setEditing(false)
    if (value === lastSaved.current) return
    startTransition(async () => {
      const result = await renameDocument(documentId, value)
      if (result.error) {
        toast.error(result.error)
        return
      }
      lastSaved.current = value
    })
  }

  const titleClasses = 'truncate text-sm font-medium'

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={current}
        onBlur={(e) => save(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.currentTarget.value = current
            e.currentTarget.blur()
          }
        }}
        className={cn(titleClasses, 'w-full bg-transparent outline-none')}
      />
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <p
        onClick={() => setEditing(true)}
        aria-label="Rename this document"
        className={cn(
          titleClasses,
          'min-w-0 -mx-1 cursor-text rounded px-1 transition-colors hover:bg-muted/50',
        )}
      >
        {current}
      </p>
      {/* Touch devices have no hover, so expose an explicit edit control on mobile. */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Rename this document"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}
