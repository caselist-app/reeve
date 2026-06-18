import { createClient } from '@/lib/supabase/server'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import { fetchDayRoster } from '@/lib/schedule/day-roster'
import { DayViewClient, type DayPanelData } from '@/components/schedule/day-view-client'
import { DayTimeline } from '@/components/schedule/day-timeline'
import { DayInfoPanel } from '@/components/schedule/day-info-panel'
import { DayInfoDock } from '@/components/schedule/day-info-dock'
import { DateStrip } from '@/components/schedule/date-strip'
import { defaultScheduleDate } from '@/lib/schedule/schedule-shell'

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
  })

  // Deduplicate hotels by id for the edit panels (the timeline keeps the
  // check-in / check-out split it needs for the spine).
  const hotelMap = new Map<string, (typeof records.hotelsLinked)[number]>()
  for (const h of [...records.hotelsLinked, ...records.hotelsCheckin, ...records.hotelsCheckout]) {
    hotelMap.set(h.id, h)
  }

  const panelData: DayPanelData = {
    shows: records.shows.map((s) => ({
      id: s.id,
      venue_name: s.venue_name,
      day_sheets: s.day_sheets,
    })),
    segments: records.segments,
    hotels: Array.from(hotelMap.values()),
    events: records.events,
    timezone,
  }

  // Roster fetched once here and shared by the info panel and the mobile dock.
  const roster = await fetchDayRoster(supabase, {
    tourId,
    segmentIds: records.linkedSegmentIds,
    hotelStayIds: records.linkedHotelIds,
  })

  return (
    <DayViewClient
      panelData={panelData}
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
      } : null}
      timeline={
        tourDate ? (
          <DayTimeline
            records={records}
            tourId={tourId}
            tourDateId={tourDate.id}
            date={selectedDate}
            timezone={timezone}
            dayType={tourDate.day_type}
            tourName={tourName}
            notes={tourDate.notes}
            customTitle={tourDate.custom_title}
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
          date={selectedDate}
          show={records.shows[0] ?? null}
          dayNotes={records.dayNotes}
          roster={roster}
        />
      }
      dayInfoDock={
        <DayInfoDock
          show={records.shows[0] ?? null}
          roster={roster}
          dayNotes={records.dayNotes}
        />
      }
    />
  )
}
