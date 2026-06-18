'use client'

import { useTransition, useState } from 'react'
import { EditPanel } from '@/components/schedule/edit-panel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateDaySheet } from '@/lib/actions/shows'
import type { Tables } from '@/lib/types/database'

type DaySheet = Pick<
  Tables<'day_sheets'>,
  | 'venue_access' | 'load_in' | 'line_check' | 'soundcheck' | 'vip'
  | 'doors' | 'support_on' | 'support_off' | 'changeover'
  | 'headliner_on' | 'headliner_off' | 'curfew' | 'load_out' | 'hotel_departure'
>

interface ShowPanelProps {
  showId: string
  venueName: string
  timezone: string
  daySheet: DaySheet | null
}

// Converts a UTC ISO string to a HH:MM time string in the given timezone.
function toTimeLocal(iso: string | null, tz: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

const SECTIONS = [
  {
    title: 'Arrival',
    fields: [
      { key: 'venue_access' as const, label: 'Venue access' },
      { key: 'load_in' as const,      label: 'Load-in'      },
    ],
  },
  {
    title: 'Production',
    fields: [
      { key: 'line_check'  as const, label: 'Line check'  },
      { key: 'soundcheck'  as const, label: 'Soundcheck'  },
      { key: 'vip'         as const, label: 'VIP'         },
    ],
  },
  {
    title: 'Show',
    fields: [
      { key: 'doors'         as const, label: 'Doors'         },
      { key: 'support_on'    as const, label: 'Support on'    },
      { key: 'support_off'   as const, label: 'Support off'   },
      { key: 'changeover'    as const, label: 'Changeover'    },
      { key: 'headliner_on'  as const, label: 'Headliner on'  },
      { key: 'headliner_off' as const, label: 'Headliner off' },
      { key: 'curfew'        as const, label: 'Curfew'        },
    ],
  },
  {
    title: 'Departure',
    fields: [
      { key: 'load_out'       as const, label: 'Load-out'       },
      { key: 'hotel_departure' as const, label: 'Hotel departure' },
    ],
  },
]

export function ShowPanel({ showId, venueName, timezone, daySheet }: ShowPanelProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    const fd = new FormData(e.currentTarget)

    const data: Record<string, string | null> = {}
    for (const section of SECTIONS) {
      for (const { key } of section.fields) {
        data[key] = (fd.get(key) as string) || null
      }
    }

    startTransition(async () => {
      const result = await updateDaySheet(showId, data as Parameters<typeof updateDaySheet>[1])
      if (result.error) { setError(result.error); return }
      setError(null)
      setSaved(true)
    })
  }

  return (
    <EditPanel title={venueName} subtitle="Day sheet">
      <form onSubmit={handleSubmit} className="space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {section.title}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
              {section.fields.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    name={key}
                    type="time"
                    defaultValue={toTimeLocal(daySheet?.[key] ?? null, timezone)}
                    className="h-7 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? 'Saving...' : 'Save'}
        </Button>
        {saved && <p className="text-xs text-muted-foreground text-center">Saved.</p>}
      </form>
    </EditPanel>
  )
}
