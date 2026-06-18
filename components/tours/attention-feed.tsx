'use client'

import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { ListRow } from '@/components/ui/list-row'
import type { Tables } from '@/lib/types/database'

type AttentionItem = Tables<'attention_items'>

interface AttentionFeedProps {
  items: AttentionItem[]
  tourId: string
}

function severityIcon(severity: number) {
  if (severity >= 8) return <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
  if (severity >= 5) return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
  return <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
}

function itemHref(item: AttentionItem, tourId: string): string | null {
  if (!item.related_id || !item.related_table) return null
  if (item.related_table === 'shows') return `/tours/${tourId}/shows/${item.related_id}`
  if (item.related_table === 'people') return `/tours/${tourId}/people`
  return null
}

export function AttentionFeed({ items, tourId }: AttentionFeedProps) {
  const open = items.filter((i) => !i.resolved_at)
  const sorted = [...open].sort((a, b) => b.severity - a.severity)

  if (sorted.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Nothing needs attention right now.
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {sorted.map((item) => {
        const href = itemHref(item, tourId)

        return (
          <li key={item.id}>
            <ListRow
              href={href ?? undefined}
              severity={item.severity >= 8 ? 'danger' : item.severity >= 5 ? 'warning' : undefined}
              className="flex items-start gap-3 text-sm"
            >
              {severityIcon(item.severity)}
              <div className="min-w-0">
                <p className="font-medium text-foreground">{item.title}</p>
                {item.detail && (
                  <p className="mt-0.5 text-muted-foreground">{item.detail}</p>
                )}
              </div>
            </ListRow>
          </li>
        )
      })}
    </ul>
  )
}
