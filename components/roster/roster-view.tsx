'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/types/database'
import { passportStatus, formatExpiry, PASSPORT_CLASS } from '@/lib/roster/passport'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ContactSheet } from '@/components/roster/contact-sheet'

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
  const [query, setQuery] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) =>
      [c.name, c.default_role, c.home_city]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    )
  }, [contacts, query])

  function handleCreated(contactId?: string) {
    setSheetOpen(false)
    if (contactId) {
      router.push(`/roster/${contactId}`)
    } else {
      router.refresh()
    }
  }

  return (
    <>
      <PageHeader
        title="Roster"
        description="Everyone you tour with. Update a passport or allergy once, and it is current on every tour."
        actions={
          <Button size="sm" onClick={() => setSheetOpen(true)}>
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
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Home city</th>
                <th className="px-4 py-2.5 font-medium">Passport expiry</th>
                <th className="px-4 py-2.5 font-medium">Dietary</th>
                <th className="px-4 py-2.5 font-medium text-right">Tours</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const status = passportStatus(c.passport_expiry)
                const flags = [c.dietary, c.allergies].filter(Boolean).join(', ')
                return (
                  <tr
                    key={c.id}
                    className="border-b last:border-0 cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => router.push(`/roster/${c.id}`)}
                  >
                    <td className="px-4 py-2.5 font-medium">
                      <Link
                        href={`/roster/${c.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.default_role ?? '-'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.home_city ?? '-'}</td>
                    <td className={cn('px-4 py-2.5', PASSPORT_CLASS[status])}>
                      {formatExpiry(c.passport_expiry)}
                      {status === 'expired' && ' (expired)'}
                      {status === 'soon' && ' (soon)'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[12rem]">
                      {flags || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {c.tourCount}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ContactSheet
        contact={null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={handleCreated}
      />
    </>
  )
}
