'use client'

import { useState, useTransition } from 'react'
import { CheckCircle } from 'lucide-react'

interface AcknowledgeButtonProps {
  shareToken: string
}

export function AcknowledgeButton({ shareToken }: AcknowledgeButtonProps) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAcknowledge() {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/share/${shareToken}/acknowledge`, {
        method: 'POST',
      })
      if (res.ok) {
        setDone(true)
      } else {
        setError('Something went wrong. Please try again or contact the tour manager.')
      }
    })
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle className="h-5 w-5 shrink-0" />
        <span className="text-sm font-medium">Acknowledged. Thank you.</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAcknowledge}
        disabled={isPending}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? 'Acknowledging...' : 'Acknowledge receipt'}
      </button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
