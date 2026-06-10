import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateAdvanceStatusFromShare } from '@/lib/shows/advance'

// Public route: no auth required. The share token is the access credential.
// Sets acknowledged_at only if it is currently null (idempotent: a second tap
// does not overwrite the original timestamp).
// After writing, calls updateAdvanceStatusFromShare to promote the relevant
// show_advance department to 'done'.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token || token.length < 10) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify the token exists before writing.
  const { data: share } = await admin
    .from('document_shares')
    .select('id, acknowledged_at')
    .eq('share_token', token)
    .single()

  if (!share) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  // Idempotent: if already acknowledged, return success without overwriting.
  if (share.acknowledged_at) {
    return NextResponse.json({ acknowledged: true, alreadySet: true })
  }

  const { error } = await admin
    .from('document_shares')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('share_token', token)
    // Only update if still null to guard against a race between two browser tabs.
    .is('acknowledged_at', null)

  if (error) {
    console.error('[acknowledge] update failed:', error)
    return NextResponse.json({ error: 'Failed to acknowledge.' }, { status: 500 })
  }

  // Promote show_advance department to 'done'. Fire and don't block the response:
  // the advance status update is secondary to the acknowledgement confirmation.
  updateAdvanceStatusFromShare(token).catch((err) => {
    console.error('[acknowledge] advance status update failed:', err)
  })

  return NextResponse.json({ acknowledged: true })
}
