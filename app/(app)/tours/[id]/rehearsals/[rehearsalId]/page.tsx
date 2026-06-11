import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { RehearsalForm } from '@/components/schedule/rehearsal-form'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function RehearsalDetailPage({
  params,
}: {
  params: Promise<{ id: string; rehearsalId: string }>
}) {
  const { id, rehearsalId } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artists(name)')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const { data: rehearsal } = await supabase
    .from('rehearsals')
    .select('*, tour_dates(date)')
    .eq('id', rehearsalId)
    .eq('tour_id', id)
    .single()

  if (!rehearsal) redirect(`/tours/${id}/shows`)

  const tourDate = Array.isArray(rehearsal.tour_dates)
    ? rehearsal.tour_dates[0]
    : rehearsal.tour_dates

  const dateLabel = tourDate?.date ? formatDate(tourDate.date) : 'Rehearsal'

  return (
    <PageLayout maxWidth="max-w-2xl">
      <div className="mb-6">
        <Link
          href={`/tours/${id}/shows`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Schedule
        </Link>
      </div>

      <PageHeader eyebrow={tour.artists?.name ?? ''} title={dateLabel} description="Rehearsal" />

      <RehearsalForm
        rehearsalId={rehearsalId}
        initialData={{
          location_name: rehearsal.location_name,
          address: rehearsal.address,
          google_maps_url: rehearsal.google_maps_url,
          start_at: rehearsal.start_at,
          end_at: rehearsal.end_at,
          notes: rehearsal.notes,
        }}
      />
    </PageLayout>
  )
}
