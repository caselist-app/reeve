'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmExtraction, discardExtraction } from '@/lib/actions/extractions'
import type { ExtractionProposal } from '@/lib/ai/extract'
import { cn } from '@/lib/utils'

type Extraction = {
  id: string
  from_address: string | null
  subject: string | null
  extraction_status: 'pending' | 'extracted' | 'failed'
  proposed_rows: ExtractionProposal | null
  created_at: string
}

type Props = {
  tourId: string
  extractions: Extraction[]
}

// Formats an ISO date string as a short readable date.
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}

function ExtractionCard({ extraction, onDone }: { extraction: Extraction; onDone: () => void }) {
  const [proposed, setProposed] = useState<ExtractionProposal>(
    extraction.proposed_rows ?? { shows: [], transport_segments: [], hotel_stays: [] }
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function setShow(idx: number, field: string, value: string) {
    setProposed((prev) => {
      const shows = [...prev.shows]
      shows[idx] = { ...shows[idx], [field]: value || null }
      return { ...prev, shows }
    })
  }

  function setSegment(idx: number, field: string, value: string) {
    setProposed((prev) => {
      const segs = [...prev.transport_segments]
      segs[idx] = { ...segs[idx], [field]: value || null }
      return { ...prev, transport_segments: segs }
    })
  }

  function setHotel(idx: number, field: string, value: string) {
    setProposed((prev) => {
      const hotels = [...prev.hotel_stays]
      hotels[idx] = { ...hotels[idx], [field]: value || null }
      return { ...prev, hotel_stays: hotels }
    })
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmExtraction(extraction.id, proposed)
      if (result.error) {
        setError(result.error)
      } else {
        onDone()
      }
    })
  }

  function handleDiscard() {
    startTransition(async () => {
      await discardExtraction(extraction.id)
      onDone()
    })
  }

  const isEmpty =
    proposed.shows.length === 0 &&
    proposed.transport_segments.length === 0 &&
    proposed.hotel_stays.length === 0

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{extraction.subject ?? '(no subject)'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {extraction.from_address ?? 'Unknown sender'} &middot; {fmtDate(extraction.created_at)}
          </p>
        </div>
        <StatusBadge status={extraction.extraction_status} />
      </div>

      {extraction.extraction_status === 'pending' && (
        <p className="text-sm text-muted-foreground">Extraction in progress...</p>
      )}

      {extraction.extraction_status === 'failed' && (
        <p className="text-sm text-destructive">
          Extraction failed. Discard this email and forward it again, or contact support.
        </p>
      )}

      {extraction.extraction_status === 'extracted' && (
        <>
          {isEmpty && (
            <p className="text-sm text-muted-foreground">
              No structured data found in this email. Discard it if it is not relevant.
            </p>
          )}

          {/* Shows */}
          {proposed.shows.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Shows ({proposed.shows.length})
              </h3>
              {proposed.shows.map((show, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <Field label="Date" value={show.date ?? ''} onChange={(v) => setShow(i, 'date', v)} />
                  <Field label="Venue" value={show.venue_name ?? ''} onChange={(v) => setShow(i, 'venue_name', v)} />
                  <Field label="Address" value={show.address ?? ''} onChange={(v) => setShow(i, 'address', v)} />
                  <Field label="Load-in" value={show.load_in_at ?? ''} onChange={(v) => setShow(i, 'load_in_at', v)} />
                  <Field label="Curfew" value={show.curfew_at ?? ''} onChange={(v) => setShow(i, 'curfew_at', v)} />
                </div>
              ))}
            </section>
          )}

          {/* Transport */}
          {proposed.transport_segments.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transport ({proposed.transport_segments.length})
              </h3>
              {proposed.transport_segments.map((seg, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <Field label="Mode" value={seg.mode ?? ''} onChange={(v) => setSegment(i, 'mode', v)} />
                  <Field label="Flight / Ref" value={seg.vehicle_or_flight_no ?? ''} onChange={(v) => setSegment(i, 'vehicle_or_flight_no', v)} />
                  <Field label="From" value={seg.origin ?? ''} onChange={(v) => setSegment(i, 'origin', v)} />
                  <Field label="To" value={seg.destination ?? ''} onChange={(v) => setSegment(i, 'destination', v)} />
                  <Field label="Departs" value={seg.depart_at ?? ''} onChange={(v) => setSegment(i, 'depart_at', v)} />
                  <Field label="Arrives" value={seg.arrive_at ?? ''} onChange={(v) => setSegment(i, 'arrive_at', v)} />
                  <Field label="Carrier" value={seg.carrier_operator ?? ''} onChange={(v) => setSegment(i, 'carrier_operator', v)} />
                  <Field label="Booking ref" value={seg.booking_reference ?? ''} onChange={(v) => setSegment(i, 'booking_reference', v)} />
                </div>
              ))}
            </section>
          )}

          {/* Hotels */}
          {proposed.hotel_stays.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Hotels ({proposed.hotel_stays.length})
              </h3>
              {proposed.hotel_stays.map((hotel, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <Field label="Hotel" value={hotel.name ?? ''} onChange={(v) => setHotel(i, 'name', v)} />
                  <Field label="City" value={hotel.city ?? ''} onChange={(v) => setHotel(i, 'city', v)} />
                  <Field label="Address" value={hotel.address ?? ''} onChange={(v) => setHotel(i, 'address', v)} />
                  <Field label="Check-in date" value={hotel.check_in_date ?? ''} onChange={(v) => setHotel(i, 'check_in_date', v)} />
                  <Field label="Check-out date" value={hotel.check_out_date ?? ''} onChange={(v) => setHotel(i, 'check_out_date', v)} />
                  <Field label="Check-in time" value={hotel.check_in_time ?? ''} onChange={(v) => setHotel(i, 'check_in_time', v)} />
                  <Field label="Check-out time" value={hotel.check_out_time ?? ''} onChange={(v) => setHotel(i, 'check_out_time', v)} />
                  <Field label="Confirmation" value={hotel.confirmation_number ?? ''} onChange={(v) => setHotel(i, 'confirmation_number', v)} />
                </div>
              ))}
            </section>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleConfirm}
              disabled={isPending || isEmpty}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                'bg-foreground text-background hover:bg-foreground/90',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {isPending ? 'Saving...' : 'Confirm and add to tour'}
            </button>
            <button
              onClick={handleDiscard}
              disabled={isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              Discard
            </button>
          </div>
        </>
      )}

      {/* Discard for failed/pending */}
      {extraction.extraction_status !== 'extracted' && (
        <div className="pt-1">
          <button
            onClick={handleDiscard}
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'extracted' | 'failed' }) {
  const map = {
    pending: { label: 'Processing', className: 'bg-amber-500/10 text-amber-600' },
    extracted: { label: 'Ready to review', className: 'bg-green-500/10 text-green-600' },
    failed: { label: 'Failed', className: 'bg-destructive/10 text-destructive' },
  }
  const { label, className } = map[status]
  return (
    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium', className)}>
      {label}
    </span>
  )
}

export function ExtractionsView({ tourId: _tourId, extractions }: Props) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
    router.refresh()
  }

  const visible = extractions.filter((e) => !dismissed.has(e.id))

  if (visible.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No extractions waiting for review.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Forward emails to your tour address and they will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      {visible.map((extraction) => (
        <ExtractionCard
          key={extraction.id}
          extraction={extraction}
          onDone={() => dismiss(extraction.id)}
        />
      ))}
    </div>
  )
}
