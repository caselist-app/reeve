import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'
import { ContactDetail } from '@/components/roster/contact-detail'

export default async function ContactPage({
  params,
}: {
  params: Promise<{ contactId: string }>
}) {
  const { contactId } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('account_id', user.id)
    .single()

  if (!contact) redirect('/roster')

  const { data: memberships } = await supabase
    .from('people')
    .select('id, person_type, role, tour_id, tours(name, artists(name), status)')
    .eq('contact_id', contactId)

  const tours = (memberships ?? []).map((m) => {
    const t = m.tours
    return {
      personId: m.id,
      tourId: m.tour_id,
      tourName: t?.name ?? 'Untitled tour',
      artistAct: t?.artists?.name ?? '',
      status: t?.status ?? '',
      role: m.role,
      personType: m.person_type,
    }
  })

  return (
    <PageLayout maxWidth="max-w-3xl">
      <ContactDetail contact={contact} tours={tours} />
    </PageLayout>
  )
}
