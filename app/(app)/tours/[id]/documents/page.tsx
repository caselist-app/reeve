import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { DocumentsView } from '@/components/documents/documents-view'
import { UploadDocumentButton } from '@/components/documents/upload-document-button'
import { fetchDocumentsPage } from '@/lib/documents/queries'

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const {
    tour,
    documents,
    shares,
    olderVersions,
    archivedDocuments,
    sharesError,
    olderVersionsError,
    archivedDocumentsError,
    error,
  } = await fetchDocumentsPage(supabase, id, user.id)

  if (!tour) redirect('/')

  const description = documents.length === 0 ? undefined : `${documents.length} document${documents.length === 1 ? '' : 's'}`

  return (
    <PageLayout maxWidth="max-w-5xl">
      <PageHeader
        eyebrow={tour.artist_name ?? ''}
        title="Documents"
        description={description}
        actions={<UploadDocumentButton tourId={id} />}
      />
      <DocumentsView
        tourId={id}
        documents={documents}
        shares={shares}
        olderVersions={olderVersions}
        archivedDocuments={archivedDocuments}
        sharesError={sharesError}
        olderVersionsError={olderVersionsError}
        archivedDocumentsError={archivedDocumentsError}
        error={error}
      />
    </PageLayout>
  )
}
