import type { Metadata } from 'next'
import { Landing } from '@/components/marketing/landing'
import { getCurrentUser } from '@/lib/auth/helpers'

export const metadata: Metadata = {
  title: 'Reeve. The operating system for the people who run tours.',
  description:
    'Reeve handles the routing, travel, day sheets and crew comms, then pushes the right detail to the right person over WhatsApp. No app for the crew. Nothing sent without you.',
  openGraph: {
    title: 'Reeve. The operating system for the people who run tours.',
    description:
      'Routing, travel, day sheets and crew comms, pushed to the right person over WhatsApp. One flat price. Unlimited crew.',
    url: 'https://yourreeve.com/home',
    siteName: 'Reeve',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reeve. The operating system for the people who run tours.',
    description:
      'Routing, travel, day sheets and crew comms, pushed to the right person over WhatsApp.',
  },
}

// Public marketing site. Signed-in visitors see app-aware CTAs.
export default async function HomePage() {
  const user = await getCurrentUser()
  return <Landing isAuthed={Boolean(user)} />
}
