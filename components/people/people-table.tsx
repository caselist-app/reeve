'use client'

import type { Tables } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
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
  people: Tables<'people'>[]
  crewDetails: Record<string, Tables<'crew_detail'>>
  onEdit: (person: Tables<'people'>) => void
  onRemove: (personId: string) => void
}

function formatExpiry(expiry: string | null): string {
  if (!expiry) return '-'
  // expiry is YYYY-MM-DD; append time to avoid timezone shifting the date
  const d = new Date(expiry + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export function PeopleTable({ people, onEdit, onRemove }: Props) {
  if (people.length === 0) return null

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Role</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">WhatsApp</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Passport expiry</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{person.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{person.role ?? '-'}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{person.whatsapp_number ?? '-'}</td>
              <td className="px-4 py-2.5">{formatExpiry(person.passport_expiry)}</td>
              <td className="px-4 py-2.5">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(person)}>
                    Edit
                  </Button>
                  <RemoveButton name={person.name} onConfirm={() => onRemove(person.id)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
