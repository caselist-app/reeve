'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { PeopleTable } from '@/components/people/people-table'
import { PersonSheet } from '@/components/people/person-sheet'
import { BulkAdd } from '@/components/people/bulk-add'
import { removePerson } from '@/lib/actions/people'
import type { Tables } from '@/lib/types/database'

type PersonType = 'artist' | 'crew' | 'management' | 'support'

const TABS: { value: PersonType; label: string; singular: string }[] = [
  { value: 'artist', label: 'Artists', singular: 'Artist' },
  { value: 'crew', label: 'Crew', singular: 'Crew' },
  { value: 'management', label: 'Management', singular: 'Management' },
  { value: 'support', label: 'Support', singular: 'Support' },
]

interface Props {
  tourId: string
  people: Tables<'people'>[]
  crewDetails: Record<string, Tables<'crew_detail'>>
}

export function PeopleView({ tourId, people, crewDetails }: Props) {
  const router = useRouter()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Tables<'people'> | null>(null)
  const [addType, setAddType] = useState<PersonType>('crew')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [_removePending, startRemove] = useTransition()

  function handleAdd(type: PersonType) {
    setEditingPerson(null)
    setAddType(type)
    setSheetOpen(true)
  }

  function handleEdit(person: Tables<'people'>) {
    setEditingPerson(person)
    setAddType(person.person_type as PersonType)
    setSheetOpen(true)
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

  function handleSuccess() {
    setSheetOpen(false)
    router.refresh()
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
                    <BulkAdd tourId={tourId} onSuccess={handleSuccess} />
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

      <PersonSheet
        tourId={tourId}
        defaultType={addType}
        person={editingPerson}
        crewDetail={editingPerson ? (crewDetails[editingPerson.id] ?? null) : null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={handleSuccess}
      />
    </>
  )
}
