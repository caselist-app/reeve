import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PlannerWorkspace } from '@/components/planner/planner-workspace'
import { BoardingPassUploader, type TransportAssignmentRow } from '@/components/planner/boarding-pass-uploader'
import { resolveHub } from '@/lib/logistics/hub-resolver'

export default async function PlannerPage({
  params,
}: {
  params: Promise<{ id: string; showId: string }>
}) {
  const { id, showId } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artists(name), timezone')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const [{ data: show }, { data: people }, { data: assignmentRows }] = await Promise.all([
    supabase
      .from('shows')
      .select(
        'id, tour_id, venue_name, date, load_in_at, hub_resolved_at, transport_hub_iata, transport_hub_rail, hub_ground_minutes'
      )
      .eq('id', showId)
      .eq('tour_id', id)
      .single(),
    supabase
      .from('people')
      .select('id, role, contacts(name, home_city)')
      .eq('tour_id', id),
    // All transport assignments for this tour so the TM can upload boarding passes.
    // Segments do not carry show_id; we show all tour segments and let the TM match by context.
    supabase
      .from('transport_assignments')
      .select(`
        id,
        boarding_pass_document_id,
        people ( contacts ( name ) ),
        transport_segments (
          mode, carrier_operator, vehicle_or_flight_no,
          origin, destination, depart_at
        )
      `)
      .eq('tour_id', id)
      .order('id'),
  ])

  if (!show) redirect(`/tours/${id}/shows`)

  // Prior show — needs show.date, so fetched after the redirect guard.
  const { data: priorShowRaw } = await supabase
    .from('shows')
    .select('id, venue_name, date, transport_hub_iata, transport_hub_rail, hub_resolved_at')
    .eq('tour_id', id)
    .lt('date', show.date)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  // Only offer the prior show as a departure option if it has a resolved hub code.
  const priorShow = priorShowRaw?.hub_resolved_at && (priorShowRaw.transport_hub_iata || priorShowRaw.transport_hub_rail)
    ? {
        venue_name: priorShowRaw.venue_name,
        date: priorShowRaw.date,
        hub: (priorShowRaw.transport_hub_iata ?? priorShowRaw.transport_hub_rail) as string,
      }
    : null

  // If hub resolution hasn't run yet, or ran but yielded no usable hub code
  // (null/null from a previous fallback run), resolve inline now. resolveHub
  // caches the result on the show row so subsequent page loads skip this step.
  const hubMissing = !show.hub_resolved_at || (!show.transport_hub_iata && !show.transport_hub_rail)
  if (hubMissing) {
    try {
      const hub = await resolveHub(show.id)
      show.hub_resolved_at = new Date().toISOString()
      show.transport_hub_iata = hub.iata
      show.transport_hub_rail = hub.rail
      show.hub_ground_minutes = hub.ground_minutes
    } catch {
      // Non-fatal: the workspace will show the "resolving" state if this fails.
    }
  }

  // Shape assignment rows into a flat structure for the boarding pass uploader.
  const assignments: TransportAssignmentRow[] = (assignmentRows ?? []).map((a) => {
    const person = (a.people as { contacts: { name: string } | null } | null)?.contacts ?? null
    const seg = a.transport_segments as {
      mode: string
      carrier_operator: string | null
      vehicle_or_flight_no: string | null
      origin: string | null
      destination: string | null
      depart_at: string | null
    } | null
    return {
      id: a.id,
      person_name: person?.name ?? 'Unknown',
      mode: seg?.mode ?? '',
      carrier_operator: seg?.carrier_operator ?? null,
      vehicle_or_flight_no: seg?.vehicle_or_flight_no ?? null,
      origin: seg?.origin ?? null,
      destination: seg?.destination ?? null,
      depart_at: seg?.depart_at ?? null,
      has_boarding_pass: !!a.boarding_pass_document_id,
    }
  })

  // Identity (name, home_city) lives on the contact; flatten to the planner's Person shape.
  const peopleList = (people ?? [])
    .map((p) => {
      const c = p.contacts as { name: string; home_city: string | null } | null
      return { id: p.id, role: p.role, name: c?.name ?? '', home_city: c?.home_city ?? null }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const formattedDate = new Date(`${show.date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/tours/${id}/shows/${showId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {show.venue_name}
      </Link>

      <div className="mb-8">
        <p className="text-sm text-muted-foreground">{(tour.artists as unknown as { name: string } | null)?.name ?? ''}</p>
        <h1 className="text-2xl font-semibold">Travel planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {show.venue_name} &nbsp;·&nbsp; {formattedDate}
        </p>
      </div>

      {peopleList.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add people to this tour before planning travel.
        </p>
      ) : (
        <div className="space-y-10">
          <PlannerWorkspace
            show={show}
            people={peopleList}
            tourId={id}
            timezone={tour.timezone}
            priorShow={priorShow}
          />

          {assignments.length > 0 && (
            <BoardingPassUploader
              tourId={id}
              assignments={assignments}
              timezone={tour.timezone}
            />
          )}
        </div>
      )}
    </div>
  )
}
