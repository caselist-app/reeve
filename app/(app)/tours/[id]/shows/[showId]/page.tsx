import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ShowForm } from '@/components/shows/show-form'
import { DaySheetForm } from '@/components/shows/day-sheet-form'
import { AdvanceTracker } from '@/components/shows/advance-tracker'
import { AdvanceDocuments, type DepartmentShareData, type ShareRow } from '@/components/shows/advance-documents'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import type { z } from 'zod'
import type { showSchema } from '@/lib/validators/show'

// Maps advance department keys to the doc_type stored on documents.
const DEPT_DOC_TYPE: Record<string, string> = {
  audio:       'tech_rider',
  hospitality: 'hospitality_rider',
  lighting:    'lighting_rider',
  staging:     'staging_rider',
}

const DEPT_LABELS: Record<string, string> = {
  audio:       'Audio',
  hospitality: 'Hospitality',
  lighting:    'Lighting',
  staging:     'Staging',
}

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

  const [
    { data: show },
    { data: advance },
    { data: daySheet },
    { data: documents },
    { data: shares },
    { data: people },
  ] = await Promise.all([
    supabase.from('shows').select('*').eq('id', showId).eq('tour_id', id).single(),
    supabase.from('show_advance').select('*').eq('show_id', showId).single(),
    supabase.from('day_sheets').select('*').eq('show_id', showId).single(),
    // Current documents for this tour, grouped by doc_type in the UI.
    supabase
      .from('documents')
      .select('id, title, doc_type')
      .eq('tour_id', id)
      .eq('is_current', true)
      .in('doc_type', Object.values(DEPT_DOC_TYPE)),
    // All shares for this show, with person name and document title + type.
    supabase
      .from('document_shares')
      .select('id, document_id, sent_at, opened_at, acknowledged_at, documents(title, doc_type), people(contacts(name))')
      .eq('show_id', showId)
      .order('created_at', { ascending: true }),
    // People on this tour with an email address (the "Send to venue" picker).
    supabase
      .from('people')
      .select('id, contacts(name, contact_email)')
      .eq('tour_id', id)
      .not('contact_email', 'is', null),
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

  // Shape shares into ShareRow, carrying doc_type for O(1) department matching below.
  const shareRows: ShareRow[] = (shares ?? []).map((s) => {
    const doc = s.documents as { title: string; doc_type: string } | null
    const person = (s.people as { contacts: { name: string } | null } | null)?.contacts ?? null
    return {
      id: s.id,
      document_id: s.document_id,
      document_title: doc?.title ?? '',
      doc_type: doc?.doc_type ?? '',
      recipient_name: person?.name ?? 'Unknown',
      sent_at: s.sent_at,
      opened_at: s.opened_at,
      acknowledged_at: s.acknowledged_at,
    }
  })

  const departmentData: DepartmentShareData[] = Object.entries(DEPT_DOC_TYPE).map(
    ([dept, docType]) => ({
      department: dept as DepartmentShareData['department'],
      label: DEPT_LABELS[dept],
      docType,
      documents: (documents ?? []).filter((d) => d.doc_type === docType),
      shares: shareRows.filter((s) => s.doc_type === docType),
    })
  )

  const contactablePeople = (people ?? [])
    .map((p) => {
      const c = p.contacts as { name: string; contact_email: string | null } | null
      return { id: p.id, name: c?.name ?? '', contact_email: c?.contact_email ?? null }
    })
    .filter((p): p is { id: string; name: string; contact_email: string } => !!p.contact_email)

  return (
    <PageLayout maxWidth="max-w-3xl">
      <Link
        href={`/tours/${id}/shows`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Shows
      </Link>

      <PageHeader
        eyebrow={tour.artist_act}
        title={show.venue_name}
        description={formattedDate}
      />

      <Tabs defaultValue="venue">
        <TabsList className="mb-6">
          <TabsTrigger value="venue">Venue</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="advance">Advance</TabsTrigger>
          <TabsTrigger value="travel">Travel</TabsTrigger>
          <TabsTrigger value="hotels">Hotels</TabsTrigger>
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
            tourId={id}
            showId={show.id}
            initialData={daySheet}
            timezone={tour.timezone}
            hubResolvedAt={show.hub_resolved_at}
          />
        </TabsContent>

        <TabsContent value="advance">
          <AdvanceTracker showId={show.id} initialAdvance={advance} />
          <AdvanceDocuments
            tourId={id}
            showId={show.id}
            departments={departmentData}
            people={contactablePeople}
          />
        </TabsContent>

        <TabsContent value="travel">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">
              Plan and record transport legs for this show. Options are ranked by
              feasibility and saved as planned segments. Book off-platform, then
              paste the reference back in.
            </p>
            <Link
              href={`/tours/${id}/shows/${showId}/planner`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Open travel planner
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="hotels">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">
              Search and record hotel options for this show night. Book
              off-platform, then enter the confirmation number to mark as
              confirmed.
            </p>
            <Link
              href={`/tours/${id}/shows/${showId}/hotels`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Open hotel search
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
