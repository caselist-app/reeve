import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

// Root. Logged-out visitors go to the marketing site at /home.
// Logged-in users are sent to their last visited tour, or their first tour, or /tours/new.
export default async function Root() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/home')
  }

  const cookieStore = await cookies()
  const lastTourId = cookieStore.get('reeve:last-tour')?.value ?? null

  if (lastTourId) {
    // Verify the tour still exists and belongs to this account before redirecting.
    const supabase = await createClient()
    const { data } = await supabase
      .from('tours')
      .select('id')
      .eq('id', lastTourId)
      .single()

    if (data) {
      redirect(`/tours/${lastTourId}`)
    }
  }

  // No cookie or tour gone — fall back to the first tour on the account.
  const supabase = await createClient()
  const { data: firstTour } = await supabase
    .from('tours')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (firstTour) {
    redirect(`/tours/${firstTour.id}`)
  }

  redirect('/tours/new')
}
