'use client'

import type { Tables } from '@/lib/types/database'
import type { PersonWithContact } from '@/components/people/people-view'
import { Button } from '@/components/ui/button'
import { StatusBadge, PASSPORT_VARIANT } from '@/components/ui/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Props {
  people: PersonWithContact[]
  crewDetails: Record<string, Tables<'crew_detail'>>
  onEdit: (person: PersonWithContact) => void
  onRemove: (personId: string) => void
}

function passportStatus(expiry: string | null): 'ok' | 'soon' | 'expired' {
  if (!expiry) return 'ok'
  const exp = new Date(expiry + 'T00:00:00')
  const now = new Date()
  if (exp < now) return 'expired'
  const days = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  return days < 90 ? 'soon' : 'ok'
}

function formatExpiry(expiry: string | null): string {
  if (!expiry) return ''
  return new Date(expiry + 'T00:00:00').toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  })
}

export function PeopleTable({ people, onEdit, onRemove }: Props) {
  if (people.length === 0) return null

  return (
    <div className="space-y-2">
      {people.map((person) => {
        const status = passportStatus(person.contacts.passport_expiry)
        const subtitle = [
          person.role,
          person.contacts.whatsapp_number,
        ].filter(Boolean)

        return (
          <div
            key={person.id}
            className="flex items-center gap-4 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{person.contacts.name}</p>
              {subtitle.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {person.role && <span>{person.role}</span>}
                  {person.role && person.contacts.whatsapp_number && (
                    <span className="mx-1">·</span>
                  )}
                  {person.contacts.whatsapp_number && (
                    <span className="font-mono">{person.contacts.whatsapp_number}</span>
                  )}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(status === 'expired' || status === 'soon') && (
                <StatusBadge
                  label={`${formatExpiry(person.contacts.passport_expiry)} (${status})`}
                  variant={PASSPORT_VARIANT[status]}
                />
              )}
              <Button variant="ghost" size="sm" onClick={() => onEdit(person)}>
                Edit
              </Button>
              <RemoveButton
                name={person.contacts.name}
                onConfirm={() => onRemove(person.id)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RemoveButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Travel and hotel assignments must be removed first. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
