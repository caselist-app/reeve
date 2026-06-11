import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/helpers'

// Root. Logged-out visitors go to the marketing site at /home.
// Logged-in users enter the app.
export default async function Root() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/home')
  }

  // Placeholder app root until the tours list UI is built.
  redirect('/tours/new')
}
