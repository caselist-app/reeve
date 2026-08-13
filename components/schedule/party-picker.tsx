'use client'

import { useState } from 'react'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { useEntityForm, type EntityActionResult } from '@/hooks/use-entity-form'
import { resolvePreset, type PartyPreset, type PartyPickerPerson } from '@/lib/party/presets'
import { cn } from '@/lib/utils'

interface PartyPickerProps {
  people: PartyPickerPerson[]
  initialPreset?: PartyPreset
  // No write path yet (REE-168): the picker resolves the preset locally and
  // hands it, plus the people it resolves to, back to the caller. When a save
  // action exists, this becomes that action's onSuccess and the stub below is
  // replaced with a real call, with no other change to this component.
  onSave: (preset: PartyPreset, people: PartyPickerPerson[]) => void
}

type PresetType = PartyPreset['type']

const PRESETS: { type: PresetType; label: string }[] = [
  { type: 'everyone', label: 'Everyone' },
  { type: 'artist', label: 'Artist' },
  { type: 'crew', label: 'Crew' },
  { type: 'named', label: 'Named' },
]

export function PartyPicker({ people, initialPreset, onSave }: PartyPickerProps) {
  const [presetType, setPresetType] = useState<PresetType>(initialPreset?.type ?? 'everyone')
  const [namedIds, setNamedIds] = useState<string[]>(
    initialPreset?.type === 'named' ? initialPreset.ids : [],
  )

  const preset: PartyPreset = presetType === 'named' ? { type: 'named', ids: namedIds } : { type: presetType }
  const resolved = resolvePreset(preset, people)

  const { submit, pending } = useEntityForm<EntityActionResult>({
    action: async () => {
      onSave(preset, resolved)
      return { error: null }
    },
  })

  function toggleNamed(personId: string) {
    setNamedIds((prev) => (prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]))
  }

  return (
    <PanelShell title="Party" description="Who this applies to">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex gap-1 rounded-lg border border-border p-1" role="radiogroup" aria-label="Party preset">
          {PRESETS.map((option) => (
            <button
              key={option.type}
              type="button"
              role="radio"
              aria-checked={presetType === option.type}
              onClick={() => setPresetType(option.type)}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                presetType === option.type
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {presetType === 'named' ? (
          <div className="space-y-1.5">
            {people.length === 0 ? (
              <p className="text-xs text-muted-foreground">No one on this tour yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border border-input divide-y divide-border">
                {people.map((person) => (
                  <label
                    key={person.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={namedIds.includes(person.id)}
                      onChange={() => toggleNamed(person.id)}
                      className="h-4 w-4 shrink-0 rounded border-input accent-foreground"
                    />
                    <span className="truncate">{person.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {resolved.length} {resolved.length === 1 ? 'person' : 'people'}
          </p>
        )}

        <Button type="submit" size="sm" disabled={pending} className="w-full">
          Done
        </Button>
      </form>
    </PanelShell>
  )
}
