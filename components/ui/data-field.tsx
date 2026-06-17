'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataFieldProps {
  label: string
  value: string | null | undefined
  // Use mono for technical data: passport numbers, phone numbers, references, codes.
  mono?: boolean
  // Adds click-to-copy behaviour. Only applies when value is present.
  copyable?: boolean
  className?: string
}

export function DataField({ label, value, mono = false, copyable = false, className }: DataFieldProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {copyable && value ? (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'group flex items-center gap-1.5 text-sm text-left rounded-md cursor-pointer transition-colors',
            '-mx-1.5 px-1.5 py-0.5',
            mono && 'font-mono',
            copied ? 'text-primary' : 'hover:bg-muted'
          )}
        >
          <span>{copied ? 'Copied' : value}</span>
          {copied ? (
            <Check className="h-3 w-3 shrink-0 text-primary" />
          ) : (
            <Copy className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
          )}
        </button>
      ) : (
        <p className={cn('text-sm', mono && 'font-mono')}>{value || '-'}</p>
      )}
    </div>
  )
}
