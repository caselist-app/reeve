import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'

// App home. requireUser redirects to /login if not authenticated.
export default async function Home() {
  await requireUser()

  // Placeholder until the tours list UI is built.
  redirect('/tours/new')
}
