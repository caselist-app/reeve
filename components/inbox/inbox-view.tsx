'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ListRow } from '@/components/ui/list-row'
import { PageHeader } from '@/components/layout/page-header'
import { markAttentionItemRead } from '@/lib/actions/inbox'
import { relativeLabel } from '@/lib/inbox/format'
import type { InboxGroup, InboxItem } from '@/lib/inbox/group'

interface Props {
  groups: InboxGroup[]
  error: string | null
}

function humanizeKind(kind: string): string {
  return kind
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

// The Inbox (brief 53): every open attention_items row across every tour the
// account owns, grouped by artist. Clicking a row is the read action: it marks
// the item read and nothing else. A read item is not a resolved one (REE-148),
// so it stays in the list, just no longer marked unread.
export function InboxView({ groups, error }: Props) {
  const [, startTransition] = useTransition()
  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(groups.flatMap((g) => g.items).filter((i) => i.read_at).map((i) => i.id))
  )

  function handleOpen(item: InboxItem) {
    if (readIds.has(item.id)) return

    // Optimistic: the dot clears immediately, the write follows. A failed
    // write puts the dot back rather than leaving the row silently wrong.
    setReadIds((prev) => new Set(prev).add(item.id))

    startTransition(async () => {
      const result = await markAttentionItemRead(item.id)
      if (result.error) {
        toast.error(result.error)
        setReadIds((prev) => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      }
    })
  }

  return (
    <>
      <PageHeader title="Inbox" description="Everything waiting on you, across every tour." />

      {error ? (
        <p className="text-sm text-destructive">
          Could not load your inbox. Try refreshing the page.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">You&rsquo;re all caught up.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.artist_id}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {group.artist_name}
              </p>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const isRead = readIds.has(item.id)
                  return (
                    <ListRow
                      key={item.id}
                      onClick={() => handleOpen(item)}
                      className="flex items-center gap-4"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          isRead ? 'bg-transparent' : 'bg-primary'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', isRead ? 'text-muted-foreground' : 'font-medium')}>
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.tour_name}
                          <span className="mx-1">·</span>
                          {humanizeKind(item.kind)}
                          {item.detail && (
                            <>
                              <span className="mx-1">·</span>
                              {item.detail}
                            </>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeLabel(item.created_at, item.tour_timezone)}
                      </span>
                    </ListRow>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
