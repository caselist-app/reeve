'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { PeopleTable } from '@/components/people/people-table'
import { removePerson } from '@/lib/actions/people'
import { useSidePanel } from '@/stores/side-panel-store'
import type { Tables } from '@/lib/types/database'
import { useState } from 'react'

// A tour membership joined with its account-level contact (identity lives there).
export type PersonWithContact = Tables<'people'> & { contacts: Tables<'contacts'> }

type PersonType = 'artist' | 'crew' | 'management' | 'support'

const TABS: { value: PersonType; label: string; singular: string }[] = [
  { value: 'artist', label: 'Artists', singular: 'Artist' },
  { value: 'crew', label: 'Crew', singular: 'Crew' },
  { value: 'management', label: 'Management', singular: 'Management' },
  { value: 'support', label: 'Support', singular: 'Support' },
]

interface Props {
  tourId: string
  people: PersonWithContact[]
  crewDetails: Record<string, Tables<'crew_detail'>>
}

export function PeopleView({ tourId, people, crewDetails }: Props) {
  const router = useRouter()
  const { open } = useSidePanel()
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [_removePending, startRemove] = useTransition()

  function handleAdd(type: PersonType) {
    open({
      type: 'contact',
      contact: null,
      tourContext: { mode: 'add', tourId, defaultType: type },
      onSuccess: () => router.refresh(),
    })
  }

  function handleEdit(person: PersonWithContact) {
    open({
      type: 'contact-view',
      contactId: person.contacts.id,
      tourContext: {
        mode: 'edit',
        personId: person.id,
        tourId,
        personType: person.person_type as PersonType,
        role: person.role,
        crewDetail: crewDetails[person.id] ?? null,
      },
      onSuccess: () => router.refresh(),
    })
  }

  function handleBulkAdd() {
    open({
      type: 'bulk-add',
      tourId,
      onSuccess: () => router.refresh(),
    })
  }

  function handleRemove(personId: string) {
    setRemoveError(null)
    startRemove(async () => {
      const result = await removePerson(personId)
      if (result.error) {
        setRemoveError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  const byType = (type: PersonType) =>
    people.filter((p) => p.person_type === type)

  return (
    <>
      {removeError && (
        <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {removeError}
        </p>
      )}

      <Tabs defaultValue="crew">
        <TabsList>
          {TABS.map((tab) => {
            const count = byType(tab.value).length
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {count > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-60 text-xs">{count}</span>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {TABS.map((tab) => {
          const tabPeople = byType(tab.value)
          return (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {tabPeople.length === 0 ? 'No one added yet.' : ''}
                </span>
                <div className="flex gap-2">
                  {tab.value === 'crew' && (
                    <Button size="sm" variant="outline" onClick={handleBulkAdd}>
                      Bulk add
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleAdd(tab.value)}>
                    Add {tab.singular}
                  </Button>
                </div>
              </div>

              <PeopleTable
                people={tabPeople}
                crewDetails={crewDetails}
                onEdit={handleEdit}
                onRemove={handleRemove}
              />
            </TabsContent>
          )
        })}
      </Tabs>
    </>
  )
}
