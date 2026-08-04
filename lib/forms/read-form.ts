// Typed FormData reader, and the one place the null versus undefined
// convention is decided.
//
// Replaces the `fd.get(name) as string || null` pattern that used to be written
// by hand in every add form and edit panel: that cast is an unchecked assertion
// in strict mode and was the single most repeated type hole in the codebase
// (Brief 32, F1). This does not add runtime validation (Zod does that); it only
// removes the hand-written cast and gives every field one reviewed conversion.
//
// The convention (Brief 37):
//
//   key absent from the FormData   undefined  the form never rendered this
//   key present, empty string      null       the TM cleared this
//   key present, has a value       the value
//
// `fd.has()` is what makes that distinction possible, and FormData is the only
// layer that still knows it. `fd.get()` returns null for both cases, so any
// code downstream of a `get`-based reader is guessing. That guess is the whole
// of Brief 37: an action that treats "absent" as "cleared" destroys data the
// form never showed the TM, and one that treats "cleared" as "absent" makes a
// field impossible to empty.
//
// This used to be a per-field choice, via 'stringOrUndefined' and
// 'numberOrUndefined'. Those kinds are gone deliberately rather than
// deprecated. A form with conditional sections has no single right answer per
// field: components/roster/contact-sheet.tsx renders the default-role input
// only in roster context and the pay inputs only in tour context, so whichever
// kind it chose was wrong in the other mode, in opposite directions, and both
// were live bugs. A choice that cannot be made correctly should not be offered.
export type FieldKind = 'string' | 'requiredString' | 'number'

type FieldShape = Record<string, FieldKind>

type FieldValue<K extends FieldKind> =
  K extends 'requiredString' ? string :
  K extends 'number' ? number | null | undefined :
  string | null | undefined

export type ParsedForm<S extends FieldShape> = {
  [K in keyof S]: FieldValue<S[K]>
}

export function readForm<S extends FieldShape>(fd: FormData, shape: S): ParsedForm<S> {
  const result: Record<string, string | number | null | undefined> = {}

  for (const key of Object.keys(shape)) {
    // Assigned in every branch, including the undefined one, so the key exists
    // on the result object. A row mapper distinguishes "not submitted" from
    // "not a field at all" by the key being present with an undefined value.
    const submitted = fd.has(key)
    const raw = fd.get(key)
    const value = typeof raw === 'string' && raw.length > 0 ? raw : null

    switch (shape[key]) {
      case 'requiredString':
        // Deliberately outside the convention: a field the HTML marks
        // `required` has no "cleared" state to represent. This kind exists so
        // an action whose input type is non-null still typechecks (e.g.
        // venue_name on createShow). It does not itself enforce presence.
        result[key] = value ?? ''
        break
      case 'number':
        result[key] = !submitted ? undefined : value === null ? null : Number(value)
        break
      default:
        result[key] = !submitted ? undefined : value
    }
  }

  return result as ParsedForm<S>
}
