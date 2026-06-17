'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Tables } from '@/lib/types/database'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) =>
      [c.name, c.default_role, c.home_city]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    )
  }, [contacts, query])

  function handleNew() {
    open({
      type: 'contact',
      contact: null,
      // After creating, open the view panel so the user sees the new contact.
      onSuccess: (contactId) => {
        if (contactId) {
          open({ type: 'contact-view', contactId, onSuccess: () => router.refresh() })
        } else {
          router.refresh()
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
          <Button size="sm" onClick={handleNew}>
            New contact
          </Button>
        }
      />

      <div className="mb-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => {
            const subtitle = [c.default_role, c.home_city].filter(Boolean).join(' · ')
            return (
              <div
                key={c.id}
                className="relative flex flex-col justify-end min-h-[120px] rounded-xl border border-border px-5 py-4 cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => open({ type: 'contact-view', contactId: c.id, onSuccess: () => router.refresh() })}
              >
                <p className="font-medium">{c.name}</p>
                {subtitle && (
                  <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                )}
                {/* Name link kept for right-click / open-in-new-tab access */}
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
      )}
    </>
  )
}
