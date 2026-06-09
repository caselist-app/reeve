import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ShowForm } from '@/components/shows/show-form'
import { DaySheetForm } from '@/components/shows/day-sheet-form'
import { AdvanceTracker } from '@/components/shows/advance-tracker'
import type { z } from 'zod'
import type { showSchema } from '@/lib/validators/show'

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string; showId: string }>
}) {
  const { id, showId } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artist_act, timezone')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/app')

  const [{ data: show }, { data: advance }, { data: daySheet }] = await Promise.all([
    supabase.from('shows').select('*').eq('id', showId).eq('tour_id', id).single(),
    supabase.from('show_advance').select('*').eq('show_id', showId).single(),
    supabase.from('day_sheets').select('*').eq('show_id', showId).single(),
  ])

  if (!show) redirect(`/tours/${id}/shows`)

  // Build the action-facing shape for ShowForm's initialData.
  const showFormData: z.infer<typeof showSchema> = {
    date: show.date,
    venue_name: show.venue_name,
    address: show.address,
    venue_type: show.venue_type as z.infer<typeof showSchema>['venue_type'],
    capacity: show.capacity,
    load_in_at: show.load_in_at,
    curfew_at: show.curfew_at,
    stage_dimensions: show.stage_dimensions,
    parking: show.parking,
    shore_power: show.shore_power,
    union_stage: show.union_stage,
    stagehands: show.stagehands,
    dressing_rooms: show.dressing_rooms,
    production_office: show.production_office,
    showers: show.showers,
    house_pa_spec: show.house_pa_spec,
    house_lighting_plot: show.house_lighting_plot,
  }

  const formattedDate = new Date(`${show.date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/tours/${id}/shows`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Shows
      </Link>

      <div className="mb-8">
        <p className="text-sm text-muted-foreground">{tour.artist_act}</p>
        <h1 className="text-2xl font-semibold">{show.venue_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formattedDate}</p>
      </div>

      <Tabs defaultValue="venue">
        <TabsList className="mb-6">
          <TabsTrigger value="venue">Venue</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="advance">Advance</TabsTrigger>
        </TabsList>

        <TabsContent value="venue">
          <ShowForm
            tourId={id}
            showId={show.id}
            initialData={showFormData}
          />
        </TabsContent>

        <TabsContent value="schedule">
          <DaySheetForm
            showId={show.id}
            initialData={daySheet}
            timezone={tour.timezone}
            hubResolvedAt={show.hub_resolved_at}
          />
        </TabsContent>

        <TabsContent value="advance">
          <AdvanceTracker showId={show.id} initialAdvance={advance} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
