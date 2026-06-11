// Public share page, no auth required.
// Accessed by venue contacts via the tracked link in the rider email.
// Sets opened_at on first visit only (subsequent visits do not overwrite).
// Shows the document and an Acknowledge button if not yet acknowledged.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcknowledgeButton } from './acknowledge-button'

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: share } = await admin
    .from('document_shares')
    .select(`
      id,
      share_token,
      opened_at,
      acknowledged_at,
      documents ( title, doc_type, storage_path ),
      people ( contacts ( name ) ),
      tours ( name, artists ( name ) )
    `)
    .eq('share_token', token)
    .single()

  if (!share) notFound()

  const doc = share.documents as { title: string; doc_type: string; storage_path: string } | null
  const person = (share.people as { contacts: { name: string } | null } | null)?.contacts ?? null
  const tour = share.tours

  if (!doc) notFound()

  // Set opened_at on first visit only.
  if (!share.opened_at) {
    await admin
      .from('document_shares')
      .update({ opened_at: new Date().toISOString() })
      .eq('share_token', token)
      // Extra guard: only update if still null, avoiding a race between two tabs.
      .is('opened_at', null)
  }

  // Generate a short-lived signed URL for the document PDF.
  const { data: signedUrlData } = await admin
    .storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 60 * 60) // 1 hour

  const artistName = tour?.artists?.name ?? tour?.name ?? 'Reeve'
  const isAcknowledged = !!share.acknowledged_at

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
            {artistName}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">{doc.title}</h1>
          {person && (
            <p className="mt-1 text-sm text-gray-500">
              Sent to {person.name}
            </p>
          )}
        </div>

        {/* Document viewer */}
        {signedUrlData?.signedUrl ? (
          <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
            <iframe
              src={signedUrlData.signedUrl}
              className="w-full"
              style={{ height: '70vh' }}
              title={doc.title}
            />
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm">
            Document unavailable. Please contact the tour manager.
          </div>
        )}

        {/* Acknowledge section */}
        {isAcknowledged ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-6 py-4 text-center">
            <p className="text-sm font-medium text-green-800">
              Acknowledged
            </p>
            <p className="mt-1 text-xs text-green-600">
              {new Date(share.acknowledged_at!).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
            <p className="text-sm text-gray-600 mb-4">
              Once you have reviewed this document, please confirm receipt by clicking below.
            </p>
            <AcknowledgeButton shareToken={token} />
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-300">Sent via Reeve</p>
      </div>
    </div>
  )
}
