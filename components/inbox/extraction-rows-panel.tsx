'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ListRow } from '@/components/ui/list-row'
import { confirmExtraction, discardExtraction } from '@/lib/actions/extractions'
import { useInboxCountStore, selectOpenCount } from '@/stores/inbox-count-store'
import { useSidePanel } from '@/stores/side-panel-store'
import type { ExtractionProposal } from '@/lib/ai/extract'

interface ExtractionRowsPanelProps {
  forwardedEmailId: string
  subjectLine: string | null
  proposal: ExtractionProposal
}

function decrementInboxCount() {
  const { serverCount, override, setOverride } = useInboxCountStore.getState()
  const current = selectOpenCount(serverCount, override)
  setOverride(serverCount, current - 1)
}

function showLine(show: ExtractionProposal['shows'][number]): { title: string; detail: string | null } {
  const times = [show.load_in && `Load-in ${show.load_in}`, show.curfew && `Curfew ${show.curfew}`]
    .filter(Boolean)
    .join(', ')
  return {
    title: show.venue_name ?? 'Unnamed venue',
    detail: [show.date, show.address, times || null].filter(Boolean).join(' · ') || null,
  }
}

function segmentLine(seg: ExtractionProposal['transport_segments'][number]): { title: string; detail: string | null } {
  const route = [seg.origin, seg.destination].filter(Boolean).join(' → ')
  return {
    title: [seg.mode, seg.vehicle_or_flight_no].filter(Boolean).join(' ') || 'Transport',
    detail: [route || null, seg.depart_at, seg.carrier_operator].filter(Boolean).join(' · ') || null,
  }
}

function hotelLine(hotel: ExtractionProposal['hotel_stays'][number]): { title: string; detail: string | null } {
  const stay = [hotel.check_in_date, hotel.check_out_date].filter(Boolean).join(' – ')
  return {
    title: hotel.name ?? hotel.city ?? 'Hotel',
    detail: [hotel.city, stay || null, hotel.confirmation_number].filter(Boolean).join(' · ') || null,
  }
}

function RowToggle({
  title,
  detail,
  kept,
  onToggle,
}: {
  title: string
  detail: string | null
  kept: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <ListRow className="flex items-center gap-3 px-3 py-2.5" interactive={false}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
      <Switch checked={kept} onCheckedChange={onToggle} aria-label={kept ? `Keep ${title}` : `Discard ${title}`} />
    </ListRow>
  )
}

function Section({
  title,
  rows,
  kept,
  onToggle,
}: {
  title: string
  rows: Array<{ title: string; detail: string | null }>
  kept: boolean[]
  onToggle: (index: number, next: boolean) => void
}) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title} ({rows.length})
      </p>
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <RowToggle
            key={i}
            title={row.title}
            detail={row.detail}
            kept={kept[i]}
            onToggle={(next) => onToggle(i, next)}
          />
        ))}
      </div>
    </section>
  )
}

// The row review panel (REE-154): every proposed row from the extraction, each
// with its own keep/discard switch, defaulting to kept. Nothing here edits a
// row's data, only whether it lands: confirmExtraction re-reads proposed_rows
// server-side and narrows it to the indices this panel sends, so the panel is
// never the source of truth for what a kept row contains.
export function ExtractionRowsPanel({ forwardedEmailId, subjectLine, proposal }: ExtractionRowsPanelProps) {
  const router = useRouter()
  const { close } = useSidePanel()
  const [keepShows, setKeepShows] = useState<boolean[]>(() => proposal.shows.map(() => true))
  const [keepSegments, setKeepSegments] = useState<boolean[]>(() => proposal.transport_segments.map(() => true))
  const [keepHotels, setKeepHotels] = useState<boolean[]>(() => proposal.hotel_stays.map(() => true))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const anyKept = keepShows.some(Boolean) || keepSegments.some(Boolean) || keepHotels.some(Boolean)
  const isEmpty = proposal.shows.length === 0 && proposal.transport_segments.length === 0 && proposal.hotel_stays.length === 0

  function toggle(setter: (fn: (prev: boolean[]) => boolean[]) => void, index: number, next: boolean) {
    setter((prev) => prev.map((v, i) => (i === index ? next : v)))
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = anyKept
        ? await confirmExtraction(forwardedEmailId, {
            shows: keepShows.flatMap((k, i) => (k ? [i] : [])),
            transport_segments: keepSegments.flatMap((k, i) => (k ? [i] : [])),
            hotel_stays: keepHotels.flatMap((k, i) => (k ? [i] : [])),
          })
        : await discardExtraction(forwardedEmailId)

      if (result.error) {
        setError(result.error)
        return
      }
      decrementInboxCount()
      close()
      router.push('/inbox')
    })
  }

  return (
    <PanelShell
      title={subjectLine ?? '(no subject)'}
      description="Review extracted rows"
      headerAction={
        <Button type="button" size="sm" disabled={pending} onClick={submit}>
          {pending ? 'Saving...' : anyKept ? 'Confirm' : 'Discard'}
        </Button>
      }
    >
      <div className="space-y-6">
        {isEmpty && (
          <p className="text-sm text-muted-foreground">No structured data was found in this email.</p>
        )}

        <Section title="Shows" rows={proposal.shows.map(showLine)} kept={keepShows} onToggle={(i, n) => toggle(setKeepShows, i, n)} />
        <Section
          title="Transport"
          rows={proposal.transport_segments.map(segmentLine)}
          kept={keepSegments}
          onToggle={(i, n) => toggle(setKeepSegments, i, n)}
        />
        <Section title="Hotels" rows={proposal.hotel_stays.map(hotelLine)} kept={keepHotels} onToggle={(i, n) => toggle(setKeepHotels, i, n)} />

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </PanelShell>
  )
}
