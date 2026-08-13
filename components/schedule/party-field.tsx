'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PartyPickerFields } from '@/components/schedule/party-picker'
import { getTourRoster } from '@/lib/actions/people'
import { getEntityParty } from '@/lib/actions/party'
import type { PartyEntity } from '@/lib/party/resolve'
import type { PartyPickerPerson, PartyPreset } from '@/lib/party/presets'

interface PartyFieldProps {
  tourId: string
  entity: PartyEntity
  onSave: (personIds: string[]) => Promise<{ error: string | null }>
}

// The read/write counterpart to the add flow's party step (REE-169). A
// detail panel opens with a snapshot of the segment/stay itself, not the
// roster or who's attached, so both are fetched fresh on mount here rather
// than threaded through every caller that can open one of these panels
// (REE-226). initialPreset is always 'named' with whoever is actually
// attached right now: reconstructing the original preset (everyone/artist/
// crew) from created_as would drift from reality the moment the roster
// changes after creation, and 'named' is honest about exactly who is on it.
export function PartyField({ tourId, entity, onSave }: PartyFieldProps) {
  const [people, setPeople] = useState<PartyPickerPerson[]>([])
  const [attachedIds, setAttachedIds] = useState<string[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const entityId = entity.ids[0]

  useEffect(() => {
    let cancelled = false
    Promise.all([getTourRoster(tourId), getEntityParty(tourId, entity)]).then(([roster, party]) => {
      if (cancelled) return
      if (!roster.error) setPeople(roster.people)
      if (!party.error) setAttachedIds(party.personIds)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, entity.kind, entityId])

  function handlePickerSave(_preset: PartyPreset, resolved: PartyPickerPerson[]) {
    setError(null)
    setSaved(false)
    setSaving(true)
    const ids = resolved.map((p) => p.id)
    onSave(ids).then((result) => {
      setSaving(false)
      if (result.error) {
        setError(result.error)
        return
      }
      setAttachedIds(ids)
      setEditing(false)
      setSaved(true)
    })
  }

  const count = attachedIds?.length ?? 0

  return (
    <div className="space-y-1">
      <Label className="text-xs">Party</Label>
      {editing ? (
        <div className="space-y-2">
          <PartyPickerFields
            people={people}
            initialPreset={{ type: 'named', ids: attachedIds ?? [] }}
            onSave={handlePickerSave}
          />
          {saving && <p className="text-[11px] text-muted-foreground">Saving...</p>}
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2">
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs',
              attachedIds !== null && count === 0 && 'text-amber-600',
            )}
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            {attachedIds === null
              ? 'Loading...'
              : count === 0
                ? 'No one attached'
                : `${count} ${count === 1 ? 'person' : 'people'}`}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 text-xs"
            disabled={attachedIds === null}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        </div>
      )}
      {saved && !editing && <p className="text-[11px] text-muted-foreground">Saved.</p>}
    </div>
  )
}
