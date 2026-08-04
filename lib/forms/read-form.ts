// Typed FormData reader. Replaces the `fd.get(name) as string || null`
// pattern that used to be written by hand in every add form and edit panel:
// that cast is an unchecked assertion in strict mode and was the single most
// repeated type hole in the codebase (Brief 32, F1). This does not add
// runtime validation (Zod coverage is deliberately out of scope for this
// pass, see the brief); it only removes the hand-written cast and gives every
// field a single, reviewed conversion.
export type FieldKind = 'string' | 'stringOrUndefined' | 'requiredString' | 'number' | 'numberOrUndefined'

type FieldShape = Record<string, FieldKind>

type FieldValue<K extends FieldKind> =
  K extends 'string' ? string | null :
  K extends 'stringOrUndefined' ? string | undefined :
  K extends 'requiredString' ? string :
  K extends 'number' ? number | null :
  number | undefined

export type ParsedForm<S extends FieldShape> = {
  [K in keyof S]: FieldValue<S[K]>
}

// Reads every field named in `shape` off `fd`. Empty strings and missing
// fields both read as null (or undefined / '' for the *OrUndefined and
// requiredString kinds), matching the `|| null` fallback the hand-written
// casts used everywhere. `requiredString` exists for fields the form marks
// `required`, where the action's input type does not accept null (e.g.
// venue_name on createShow): it does not itself enforce presence, the HTML
// `required` attribute still does that.
export function readForm<S extends FieldShape>(fd: FormData, shape: S): ParsedForm<S> {
  const result: Record<string, string | number | null | undefined> = {}

  for (const key of Object.keys(shape)) {
    const raw = fd.get(key)
    const value = typeof raw === 'string' && raw.length > 0 ? raw : null

    switch (shape[key]) {
      case 'string':
        result[key] = value
        break
      case 'stringOrUndefined':
        result[key] = value ?? undefined
        break
      case 'requiredString':
        result[key] = value ?? ''
        break
      case 'number':
        result[key] = value === null ? null : Number(value)
        break
      case 'numberOrUndefined':
        result[key] = value === null ? undefined : Number(value)
        break
    }
  }

  return result as ParsedForm<S>
}
