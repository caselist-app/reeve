'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PeopleTable } from '@/components/people/people-table'
import { removePerson } from '@/lib/actions/people'
import { useSidePanel } from '@/stores/side-panel-store'
import type { Tables } from '@/lib/types/database'

// A tour membership joined with its account-level contact (identity lives there).
export type PersonWithContact = Tables<'people'> & { contacts: Tables<'contacts'> }

type PersonType = 'artist' | 'crew' | 'management' | 'support'

const SECTIONS: { value: PersonType; label: string; singular: string }[] = [
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

  function handleAdd(type: PersonType) {
    open({
      type: 'add-person',
      tourId,
      personType: type,
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

  async function handleRemove(personId: string): Promise<string | null> {
    const result = await removePerson(personId)
    if (result.error) return result.error
    router.refresh()
    return null
  }

  const byType = (type: PersonType) =>
    people.filter((p) => p.person_type === type)

  return (
    <div className="space-y-8">
      {SECTIONS.map((section) => {
        const sectionPeople = byType(section.value)
        return (
          <div key={section.value}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {section.label}
                {sectionPeople.length > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-60">{sectionPeople.length}</span>
                )}
              </p>
              <div className="flex gap-2">
                {section.value === 'crew' && (
                  <Button size="sm" variant="outline" onClick={handleBulkAdd}>
                    Bulk add
                  </Button>
                )}
                <Button size="sm" onClick={() => handleAdd(section.value)}>
                  Add {section.singular}
                </Button>
              </div>
            </div>

            {sectionPeople.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one added yet.</p>
            ) : (
              <PeopleTable
                people={sectionPeople}
                crewDetails={crewDetails}
                onEdit={handleEdit}
                onRemove={handleRemove}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
