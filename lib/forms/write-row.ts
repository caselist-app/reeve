// The write half of the convention readForm reads. See lib/forms/read-form.ts
// for the rule itself.
//
// A row mapper turns a validated form DTO into the object handed to Supabase.
// supabase-js serialises that object as JSON, and JSON.stringify drops keys
// whose value is undefined, so an absent key is simply not written and the
// stored value survives. A key holding null is serialised and nulls the column.
// That is exactly the behaviour the convention wants, and it is entirely
// undone by a mapper that writes `field: value ?? null`, because every field
// the form never sent arrives as null and every column is overwritten.
//
// This is the third place in the repo to need it (updateDaySheet's skip loop
// and toRow's hand-written conditional spreads are the first two), which is the
// point COMPONENTS.md says to extract rather than write again.
export function definedOnly<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Partial<T> = {}

  for (const key of Object.keys(row) as (keyof T)[]) {
    if (row[key] !== undefined) out[key] = row[key]
  }

  return out
}
