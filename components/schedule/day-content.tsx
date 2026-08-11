import { createClient } from '@/lib/supabase/server'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import { fetchDayRoster } from '@/lib/schedule/day-roster'
import { fetchGuestListSummary } from '@/lib/schedule/guest-list-summary'
import { DayViewClient } from '@/components/schedule/day-view-client'
import { DayCalendar } from '@/components/schedule/day-calendar'
import { DayHeader } from '@/components/schedule/day-header'
import { DayInfoPanel } from '@/components/schedule/day-info-panel'
import { DayInfoDock } from '@/components/schedule/day-info-dock'
import { DateStrip } from '@/components/schedule/date-strip'
import { defaultScheduleDate } from '@/lib/schedule/schedule-shell'
import type { DayType } from '@/lib/schedule/day-link'

interface TourDateLite {
  id: string
  day_type: string
  notes: string | null
  custom_title: string | null
}

interface TourDateShell {
  id: string
  date: string
  day_type: string
}

interface DayContentProps {
  tourId: string
  tourName: string
  timezone: string
  selectedDate: string
  tourDate: TourDateLite | null
  dates: TourDateShell[]
}

// The per-day half of the schedule. It is rendered inside a Suspense boundary
// so the date sidebar paints immediately while this fetch resolves.
export async function DayContent({ tourId, tourName, timezone, selectedDate, tourDate, dates }: DayContentProps) {
  const supabase = await createClient()

  const records = await fetchDayRecords(supabase, {
    tourId,
    tourDateId: tourDate?.id ?? null,
    date: selectedDate,
    timezone,
  })

  // Roster fetched once here and shared by the info panel and the mobile dock.
  // The guest list count for the day-info block rides alongside it: both depend
  // only on `records`, so they run in parallel rather than in series. A day with
  // no show passes a null show id and the summary short-circuits to zeros.
  const [roster, guestListSummary] = await Promise.all([
    fetchDayRoster(supabase, {
      tourId,
      segmentIds: records.segmentIds,
      hotelStayIds: records.hotelStayIds,
    }),
    fetchGuestListSummary(supabase, records.shows[0]?.id ?? null),
  ])

  return (
    <DayViewClient
      dateStrip={
        <DateStrip
          tourId={tourId}
          dates={dates}
          defaultDate={defaultScheduleDate(dates)}
        />
      }
      addContext={{
        tourId,
        tourDateId: tourDate?.id ?? '',
        date: selectedDate,
        timezone,
      }}
      dayMeta={tourDate ? {
        tourDateId: tourDate.id,
        dayType: tourDate.day_type as 'show' | 'rehearsal' | 'travel' | 'press' | 'day_off',
        notes: tourDate.notes ?? null,
        hasShow: records.shows.length > 0,
      } : null}
      timeline={
        tourDate ? (
          <DayCalendar
            records={records}
            tourId={tourId}
            tourDateId={tourDate.id}
            timezone={timezone}
            date={selectedDate}
            header={
              <DayHeader
                tourId={tourId}
                tourDateId={tourDate.id}
                date={selectedDate}
                dayType={tourDate.day_type}
                tourName={tourName}
                timezone={timezone}
                notes={tourDate.notes}
                customTitle={tourDate.custom_title}
              />
            }
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 py-10">
            <p className="text-sm text-muted-foreground">No data for this day.</p>
          </div>
        )
      }
      dayInfoPanel={
        <DayInfoPanel
          tourId={tourId}
          tourDateId={tourDate?.id ?? null}
          dayType={(tourDate?.day_type as DayType | undefined) ?? null}
          date={selectedDate}
          show={records.shows[0] ?? null}
          dayNotes={tourDate?.notes ?? null}
          roster={roster}
          guestListSummary={guestListSummary}
        />
      }
      dayInfoDock={
        <DayInfoDock
          show={records.shows[0] ?? null}
          roster={roster}
          dayNotes={tourDate?.notes ?? null}
        />
      }
    />
  )
}
