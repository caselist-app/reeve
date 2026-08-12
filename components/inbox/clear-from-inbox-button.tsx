'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { resolveAttentionItem } from '@/lib/actions/inbox'

// The one place a TM may clear an Inbox item by hand: a dangling pointer, the
// single exception to "producers create rows and producers resolve them"
// (brief 53, REE-152). Every other resolve happens inside a producer's own
// decide path; this button is the only caller of resolveAttentionItem outside
// one.
export function ClearFromInboxButton({
  relatedTable,
  relatedId,
}: {
  relatedTable: string
  relatedId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClear() {
    setError(null)
    startTransition(async () => {
      const result = await resolveAttentionItem(relatedTable, relatedId)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push('/inbox')
    })
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleClear}>
        {pending ? 'Clearing...' : 'Clear from Inbox'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
