'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Tables } from '@/lib/types/database'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Input } from '@/components/ui/input'
import { useSidePanel } from '@/stores/side-panel-store'

// Subset of contacts fetched by the roster page. Emergency contact details,
// passport numbers, and wage defaults are excluded from the list payload
// to reduce browser exposure of sensitive data. They load when the sheet opens.
type ContactRow = Omit<
  Tables<'contacts'>,
  | 'emergency_contact_name' | 'emergency_contact_phone'
  | 'passport_number'
  | 'default_per_diem_rate' | 'default_per_diem_currency'
  | 'default_daily_wage_rate' | 'default_wage_currency'
> & { tourCount: number }

interface Props {
  contacts: ContactRow[]
}

export function RosterView({ contacts }: Props) {
  const router = useRouter()
  const { open } = useSidePanel()
  const [query, setQuery] = useState('')

  const SECTIONS = ['artist', 'crew', 'management', 'support'] as const
  const SECTION_LABELS: Record<string, string> = {
    artist: 'Artist',
    crew: 'Crew',
    management: 'Management',
    support: 'Support',
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) =>
      [c.name, c.default_role, c.home_city]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    )
  }, [contacts, query])

  const grouped = useMemo(() => {
    const map: Record<string, ContactRow[]> = {}
    for (const c of filtered) {
      const key = c.default_person_type ?? 'crew'
      ;(map[key] ??= []).push(c)
    }
    return map
  }, [filtered])

  function handleNew() {
    open({
      type: 'contact',
      contact: null,
      // After creating, refresh the roster grid immediately, then open the view panel.
      onSuccess: (contactId) => {
        router.refresh()
        if (contactId) {
          open({ type: 'contact-view', contactId, onSuccess: () => router.refresh() })
        }
      },
    })
  }

  return (
    <>
      <PageHeader
        title="Roster"
        description="Everyone you tour with. Update a passport or allergy once, and it is current on every tour."
        actions={
          <button
            type="button"
            aria-label="New contact"
            title="New contact"
            onClick={handleNew}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/70"
          >
            <Plus className="h-4 w-4" />
          </button>
        }
      />

      <div className="mb-8">
        <Input
          placeholder="Search by name, role, or city"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No contacts yet. Add someone here, or they are added automatically when you add crew to a tour.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contacts match that search.</p>
      ) : (
        <div className="space-y-8">
          {SECTIONS.filter((s) => grouped[s]?.length).map((section) => (
            <div key={section}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {SECTION_LABELS[section]}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {grouped[section].map((c) => {
                  const subtitle = [c.default_role, c.home_city].filter(Boolean).join(' · ')
                  const initials = c.name
                    .split(' ')
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()

                  return (
                    <div
                      key={c.id}
                      className="relative flex flex-col rounded-xl border border-border bg-card cursor-pointer transition-colors hover:bg-muted/40 overflow-hidden"
                      onClick={() => open({ type: 'contact-view', contactId: c.id, onSuccess: () => router.refresh() })}
                    >
                      {/* Top band */}
                      <div className="h-1.5 w-full bg-foreground/8" />

                      <div className="flex items-center gap-4 px-5 py-4">
                        {/* Avatar */}
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-muted flex items-center justify-center cursor-pointer">
                          <span className="text-[13px] font-semibold text-muted-foreground tracking-wide">{initials}</span>
                        </div>

                        {/* Details */}
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium leading-snug truncate">{c.name}</p>
                          {subtitle && (
                            <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/roster/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="sr-only"
                        tabIndex={-1}
                        aria-label={`Open ${c.name} detail page`}
                      >
                        {c.name}
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
