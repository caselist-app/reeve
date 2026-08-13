// Brief 35. The write-side counterpart to lib/party/resolve.ts: that file
// answers "who is attached to this record" by reading transport_assignments /
// room_assignments; this answers "who does a preset the TM picked resolve to"
// against a roster already in hand, with no query of its own. Kept pure so
// party-picker.tsx and its test can call it with a plain array.
export type PartyPreset =
  | { type: 'everyone' }
  | { type: 'artist' }
  | { type: 'crew' }
  | { type: 'named'; ids: string[] }

export interface PartyPickerPerson {
  id: string
  name: string
  person_type: string
}

// 'named' carries its own ids on the preset rather than taking a separate
// parameter, so a caller can never pass a 'named' selection alongside ids for
// a different preset by mistake: the two are one value.
export function resolvePreset<T extends { id: string; person_type: string }>(
  preset: PartyPreset,
  people: T[],
): T[] {
  switch (preset.type) {
    case 'everyone':
      return people
    case 'artist':
      return people.filter((p) => p.person_type === 'artist')
    case 'crew':
      return people.filter((p) => p.person_type === 'crew')
    case 'named': {
      const ids = new Set(preset.ids)
      return people.filter((p) => ids.has(p.id))
    }
  }
}
