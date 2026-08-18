import {
  Clock,
  BedDouble,
  Sun,
  CloudSun,
  CloudFog,
  CloudRain,
  Snowflake,
  CloudLightning,
  Cloud,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { parseLocation, parseCity } from '@/lib/schedule/format'
import { EditableDayTitle } from '@/components/schedule/editable-day-title'
import { resolveShowWeather, type ShowWeather } from '@/lib/schedule/venue-weather'
import { wmoToIcon } from '@/lib/weather/wmo-codes'

interface DayHeaderProps {
  tourId: string
  tourDateId: string
  date: string
  dayType: string
  tourName: string
  timezone: string
  notes: string | null
  customTitle: string | null
}

const PILL: Record<string, { label: string; cls: string }> = {
  show:      { label: 'Show day',   cls: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  travel:    { label: 'Travel day', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
  press:     { label: 'Press day',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  rehearsal: { label: 'Rehearsal',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  day_off:   { label: 'Day off',    cls: 'bg-stone-100 text-stone-600 dark:bg-stone-500/15 dark:text-stone-300' },
}

interface MetaItem {
  icon: LucideIcon
  text: string
}

// wmoToIcon names its icon as a lucide component name; resolved through an
// explicit map rather than a dynamic lucide-react lookup, same reasoning as
// EVENT_ICONS in day-calendar.tsx: the dynamic form pulls the entire icon
// set into this route's bundle. Every name wmo-codes.ts can emit is covered.
const WEATHER_ICONS: Record<string, LucideIcon> = {
  Sun,
  CloudSun,
  CloudFog,
  CloudRain,
  Snowflake,
  CloudLightning,
  Cloud,
}

function weatherIcon(name: string): LucideIcon {
  return WEATHER_ICONS[name] ?? Cloud
}

interface Derived {
  title: string
  subtitle: string
  meta: MetaItem[]
}

// Time fields come either as a timestamptz ISO string or a Postgres "HH:MM:SS".
function formatTime(value: string | null, tz: string): string | null {
  if (!value) return null
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

function weekdayName(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
}

// Caselist-style date badge: solid dark fill, white text, day over month.
function DateBadge({ date }: { date: string }) {
  const d = new Date(`${date}T00:00:00`)
  const day = String(d.getDate())
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()
  return (
    <div className="hidden h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-foreground leading-none text-background lg:flex">
      <span className="text-xl font-semibold tabular-nums leading-none">{day}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide leading-none">{month}</span>
    </div>
  )
}

// Resolve the per-type title, subtitle, and meta facts. Each branch runs only
// the query it needs.
async function derive(props: DayHeaderProps): Promise<Derived> {
  const { tourId, tourDateId, date, dayType, timezone, notes } = props
  const supabase = await createClient()

  switch (dayType) {
    case 'show': {
      // REE-289: capacity, load-in and curfew used to repeat here as chips,
      // duplicating the day-info panel and the timeline below on the same
      // screen. The venue is still the title; nothing else from the show
      // belongs in the header.
      const { data: show } = await supabase
        .from('shows')
        .select('venue_name')
        .eq('tour_id', tourId)
        .eq('tour_date_id', tourDateId)
        .maybeSingle()

      return {
        title: show?.venue_name ?? 'Show',
        subtitle: '',
        meta: [],
      }
    }

    case 'travel': {
      const { data: nextShow } = await supabase
        .from('shows')
        .select('venue_name, address')
        .eq('tour_id', tourId)
        .gt('date', date)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()

      const anchor = nextShow ? parseCity(nextShow.address) || nextShow.venue_name : ''
      return {
        title: anchor ? `Travel to ${anchor}` : 'Travel day',
        subtitle: '',
        meta: [],
      }
    }

    case 'rehearsal': {
      const { data: reh } = await supabase
        .from('rehearsals')
        .select('location_name, address, start_at, end_at')
        .eq('tour_id', tourId)
        .eq('tour_date_id', tourDateId)
        .maybeSingle()

      const start = formatTime(reh?.start_at ?? null, timezone)
      const end = formatTime(reh?.end_at ?? null, timezone)
      const meta: MetaItem[] = []
      if (start) meta.push({ icon: Clock, text: end ? `${start} to ${end}` : start })

      return {
        title: reh?.location_name ?? 'Rehearsal',
        subtitle: parseLocation(reh?.address ?? null),
        meta,
      }
    }

    case 'press': {
      return { title: 'Press day', subtitle: notes ?? '', meta: [] }
    }

    default: {
      // day_off: anchor on a linked hotel if one exists.
      let { data: hotel } = await supabase
        .from('hotel_stays')
        .select('name, city')
        .eq('tour_id', tourId)
        .eq('tour_date_id', tourDateId)
        .limit(1)
        .maybeSingle()

      if (!hotel) {
        ({ data: hotel } = await supabase
          .from('hotel_stays')
          .select('name, city')
          .eq('tour_id', tourId)
          .is('tour_date_id', null)
          .eq('check_in_date', date)
          .limit(1)
          .maybeSingle())
      }

      const meta: MetaItem[] = []
      if (hotel?.name) meta.push({ icon: BedDouble, text: hotel.name })

      return { title: 'Day off', subtitle: hotel?.city ?? '', meta }
    }
  }
}

// The chip in the eyebrow row, separate from derive()'s per-day-type meta:
// travel and press hardcode meta: [], and weather only ever applies to a
// show day, so folding it in there would mean touching every branch for a
// fact that belongs to one of them. Only a show day looks up weather at all.
async function deriveWeather(props: DayHeaderProps): Promise<ShowWeather> {
  const { tourId, tourDateId, dayType } = props
  if (dayType !== 'show') return null

  const supabase = await createClient()
  const { data: show } = await supabase
    .from('shows')
    .select('id')
    .eq('tour_id', tourId)
    .eq('tour_date_id', tourDateId)
    .maybeSingle()

  if (!show) return null

  return resolveShowWeather(supabase, show.id)
}

export async function DayHeader(props: DayHeaderProps) {
  const { tourDateId, date, dayType, tourName, customTitle } = props
  const pill = PILL[dayType] ?? PILL.day_off
  const [{ title, subtitle, meta }, weather] = await Promise.all([
    derive(props),
    deriveWeather(props),
  ])
  const WeatherIcon = weather ? weatherIcon(wmoToIcon(weather.code)) : null

  return (
    <div className="shrink-0 px-4 pt-3 pb-3 lg:px-8 lg:pt-6 lg:pb-4">
      {/* Badge is vertically centred against the eyebrow + title head. */}
      <div className="flex items-center gap-4">
        <DateBadge date={date} />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Eyebrow: day type + weekday + tour, weather chip pushed right */}
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', pill.cls)}>
                {pill.label}
              </span>
              <span className="whitespace-normal text-[11px] font-medium uppercase tracking-wider text-muted-foreground lg:truncate">
                {weekdayName(date)} · {tourName}
              </span>
            </div>

            {weather && WeatherIcon && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
                <WeatherIcon className="h-3.5 w-3.5 text-muted-foreground/70" />
                {Math.round(weather.tempC)}°C
              </span>
            )}
          </div>

          {/* Title (editable; blank reverts to the derived default) */}
          <EditableDayTitle
            tourDateId={tourDateId}
            customTitle={customTitle}
            derivedTitle={title}
          />
        </div>
      </div>

      {/* Subtitle and meta sit below, indented to line up under the title. */}
      {(subtitle || meta.length > 0) && (
        <div className="mt-2 pl-0 lg:pl-[72px]">
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}

          {meta.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              {meta.map(({ icon: Icon, text }) => (
                <span key={text} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                  {text}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
