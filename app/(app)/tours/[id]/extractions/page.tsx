import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { ExtractionsView } from '@/components/extractions/extractions-view'
import type { ExtractionProposal } from '@/lib/ai/extract'

export default async function ExtractionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artist_act')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/tours/new')

  // Show pending extractions (extracted + failed). Confirmed are done and hidden.
  const { data: rows } = await supabase
    .from('forwarded_emails')
    .select('id, from_address, subject, extraction_status, proposed_rows, created_at')
    .eq('tour_id', id)
    .in('extraction_status', ['pending', 'extracted', 'failed'])
    .order('created_at', { ascending: false })

  const extractions = (rows ?? []).map((r) => ({
    id: r.id,
    from_address: r.from_address,
    subject: r.subject,
    extraction_status: r.extraction_status as 'pending' | 'extracted' | 'failed',
    proposed_rows: (r.proposed_rows ?? null) as ExtractionProposal | null,
    created_at: r.created_at,
  }))

  const pendingCount = extractions.filter((e) => e.extraction_status === 'extracted').length

  return (
    <PageLayout>
      <PageHeader
        eyebrow={tour.artist_act}
        title="Extractions"
        description={
          pendingCount > 0
            ? `${pendingCount} email${pendingCount === 1 ? '' : 's'} ready to review`
            : 'No emails waiting for review'
        }
      />
      <ExtractionsView tourId={id} extractions={extractions} />
    </PageLayout>
  )
}
