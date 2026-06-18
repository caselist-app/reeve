'use client'

import { useState, useTransition, useEffect } from 'react'
import { Search, Plus, Check } from 'lucide-react'
import { getAvailableContacts } from '@/lib/actions/contacts'
import { addContactToTour } from '@/lib/actions/people'
import type { Tables } from '@/lib/types/database'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type PersonType = 'artist' | 'crew' | 'management' | 'support'
type RosterContact = Pick<Tables<'contacts'>, 'id' | 'name' | 'default_role' | 'default_person_type'>

interface Props {
  tourId: string
  personType: PersonType
  onSuccess: () => void
}

export function AddPersonPanel({ tourId, personType, onSuccess }: Props) {
  const { open, close } = useSidePanel()
  const [contacts, setContacts] = useState<RosterContact[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    getAvailableContacts(tourId)
      .then(({ data, error }) => {
        if (data) setContacts(data)
        else setFetchError(error ?? 'Could not load roster.')
      })
      .catch(() => setFetchError('Could not load roster.'))
      .finally(() => setLoading(false))
  }, [tourId])

  function handleAdd(contact: RosterContact) {
    if (added.has(contact.id) || pending) return
    startTransition(async () => {
      const result = await addContactToTour(tourId, contact.id, personType)
      if (result.error) {
        setErrors((prev) => ({ ...prev, [contact.id]: result.error! }))
      } else {
        setAdded((prev) => new Set(prev).add(contact.id))
        setErrors((prev) => { const next = { ...prev }; delete next[contact.id]; return next })
        onSuccess()
      }
    })
  }

  function handleCreateNew() {
    open({
      type: 'contact',
      contact: null,
      tourContext: { mode: 'add', tourId, defaultType: personType },
      onSuccess: () => {
        onSuccess()
        close()
      },
    })
  }

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    (c.default_role ?? '').toLowerCase().includes(query.toLowerCase())
  )

  const typeLabel = personType.charAt(0).toUpperCase() + personType.slice(1)

  return (
    <PanelShell
      title={`Add ${typeLabel}`}
      description="Pick from your roster or create someone new."
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search roster..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}

        {loading && <p className="text-sm text-muted-foreground">Loading roster...</p>}

        {!loading && !fetchError && (
          <>
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {contacts.length === 0
                  ? 'Your roster is empty.'
                  : 'No matches.'}
              </p>
            )}

            <div className="space-y-1">
              {filtered.map((contact) => {
                const isAdded = added.has(contact.id)
                const addError = errors[contact.id]
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleAdd(contact)}
                    disabled={isAdded || pending}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition-colors',
                      isAdded
                        ? 'opacity-50 cursor-default'
                        : 'hover:bg-muted cursor-pointer'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{contact.name}</span>
                      {contact.default_role && (
                        <span className="ml-2 text-muted-foreground">{contact.default_role}</span>
                      )}
                      {addError && (
                        <span className="block text-xs text-destructive">{addError}</span>
                      )}
                    </span>
                    {isAdded && <Check className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                )
              })}
            </div>

            <Separator />

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleCreateNew}
            >
              <Plus className="mr-2 h-4 w-4" />
              New person (not in roster)
            </Button>
          </>
        )}
      </div>
    </PanelShell>
  )
}
