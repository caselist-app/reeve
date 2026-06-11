import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { AttentionFeed } from '@/components/tours/attention-feed'
import { AdvanceDots } from '@/components/shows/advance-dots'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import type { Tables } from '@/lib/types/database'

type ShowRow = { id: string; date: string; venue_name: string; load_in_at: string | null }
type ShowAdvance = Tables<'show_advance'>

function formatShowDate(date: string, timezone: string | null) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone ?? 'UTC',
  })
}

function formatLoadIn(loadInAt: string | null, timezone: string | null) {
  if (!loadInAt) return null
  return new Date(loadInAt).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone ?? 'UTC',
  })
}

function isUpcoming(show: ShowRow): boolean {
  return show.date >= new Date().toISOString().slice(0, 10)
}

export default async function TourHomePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artists(name), timezone')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const [{ data: attentionItems }, { data: shows }, { data: advances }] = await Promise.all([
    supabase
      .from('attention_items')
      .select('*')
      .eq('tour_id', id)
      .is('resolved_at', null)
      .order('severity', { ascending: false })
      .limit(20),
    supabase
      .from('shows')
      .select('id, date, venue_name, load_in_at')
      .eq('tour_id', id)
      .order('date', { ascending: true }),
    supabase.from('show_advance').select('*').eq('tour_id', id),
  ])

  const advanceByShow: Record<string, ShowAdvance> = {}
  for (const a of advances ?? []) {
    advanceByShow[a.show_id] = a
  }

  const upcomingShows = (shows ?? []).filter(isUpcoming).slice(0, 3)

  // Stats for the header strip.
  const totalShows = (shows ?? []).length
  const completedShows = (shows ?? []).filter((s) => !isUpcoming(s)).length
  const openItems = (attentionItems ?? []).length

  const headerDescription = [
    `${totalShows} show${totalShows !== 1 ? 's' : ''}`,
    completedShows > 0 ? `${completedShows} done` : null,
    openItems > 0 ? `${openItems} attention item${openItems !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <PageLayout maxWidth="max-w-3xl">
      <PageHeader eyebrow={(tour.artists as unknown as { name: string } | null)?.name ?? ''} title={tour.name} description={headerDescription} />

      {/* Attention feed */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Needs attention
        </h2>
        <AttentionFeed items={attentionItems ?? []} tourId={id} />
      </section>

      {/* Upcoming shows */}
      {upcomingShows.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Coming up
            </h2>
            <Link
              href={`/tours/${id}/shows`}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              All shows
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <ul className="space-y-2">
            {upcomingShows.map((show) => {
              const advance = advanceByShow[show.id] ?? null
              const loadIn = formatLoadIn(show.load_in_at, tour.timezone)
              return (
                <li key={show.id}>
                  <Link
                    href={`/tours/${id}/shows/${show.id}`}
                    className="flex items-center gap-4 rounded-xl border border-border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{show.venue_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatShowDate(show.date, tour.timezone)}
                        {loadIn && <span className="ml-2">Load in {loadIn}</span>}
                      </p>
                    </div>
                    <AdvanceDots advance={advance} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Empty state when no shows yet */}
      {totalShows === 0 && (
        <section>
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No shows yet</p>
            <p className="mt-1">
              <Link href={`/tours/${id}/shows`} className="underline underline-offset-2 hover:text-foreground transition-colors">
                Add your first show
              </Link>{' '}
              to get started.
            </p>
          </div>
        </section>
      )}
    </PageLayout>
  )
}
