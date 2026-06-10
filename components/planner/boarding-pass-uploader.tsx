'use client'

import { useRef, useState, useTransition } from 'react'
import { Upload, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadBoardingPassAction } from '@/lib/actions/boarding-pass-upload'

export interface TransportAssignmentRow {
  id: string
  person_name: string
  mode: string
  carrier_operator: string | null
  vehicle_or_flight_no: string | null
  origin: string | null
  destination: string | null
  depart_at: string | null
  has_boarding_pass: boolean
}

interface BoardingPassUploaderProps {
  tourId: string
  assignments: TransportAssignmentRow[]
  timezone: string | null
}

function formatSegmentLabel(row: TransportAssignmentRow): string {
  const ref = row.vehicle_or_flight_no ?? row.mode
  const route =
    row.origin && row.destination ? ` ${row.origin} to ${row.destination}` : ''
  return `${ref}${route}`
}

function formatDepart(iso: string | null, tz: string | null): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz ?? 'UTC',
  })
}

interface RowProps {
  tourId: string
  row: TransportAssignmentRow
  timezone: string | null
}

function AssignmentRow({ tourId, row, timezone }: RowProps) {
  const [uploaded, setUploaded] = useState(row.has_boarding_pass)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    const formData = new FormData()
    formData.set('boarding_pass', file)

    startTransition(async () => {
      const result = await uploadBoardingPassAction(tourId, row.id, formData)
      if (result.error) {
        setError(result.error)
      } else {
        setUploaded(true)
      }
      // Reset the file input so the same file can be re-uploaded if needed.
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{row.person_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatSegmentLabel(row)} &nbsp;·&nbsp; {formatDepart(row.depart_at, timezone)}
        </p>
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      <div className="shrink-0">
        {uploaded ? (
          <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5" />
            Uploaded
          </span>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
              id={`bp-upload-${row.id}`}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {isPending ? 'Uploading...' : 'Upload PDF'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export function BoardingPassUploader({
  tourId,
  assignments,
  timezone,
}: BoardingPassUploaderProps) {
  if (assignments.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Boarding passes</h3>
      <p className="text-xs text-muted-foreground">
        Upload a PDF for each booked segment. It will be sent to the crew member 3 hours before departure.
      </p>
      <div className="space-y-2">
        {assignments.map((row) => (
          <AssignmentRow key={row.id} tourId={tourId} row={row} timezone={timezone} />
        ))}
      </div>
    </div>
  )
}
