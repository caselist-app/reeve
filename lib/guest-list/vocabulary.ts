// Brief 52. The one list of the three guest list vocabularies.
//
// guest_type (who the guest is), pass_type (what they get) and pickup (where
// they collect) each have a fixed set of values with a TM-facing label. They
// live here once and are imported by the validator, the panel, the chat flow and
// the email template, so a value added in one place is a value everywhere.
//
// THESE MUST AGREE WITH THE CHECK CONSTRAINTS in
// supabase/migrations/20260811130000_create_guest_list_entries.sql and
// 20260811140000_create_guest_list_allotments.sql. This is the same shape as
// lib/schedule/day-item-kinds.ts, whose migration agreement is pinned by
// check:conventions rule 10. Adding an equivalent rule for these three is out of
// scope until a fourth drift bug appears (brief decision); until then, keep them
// in step by hand.

export interface VocabularyOption<T extends string> {
  // The stored value. Matches the migration's check constraint exactly.
  value: T
  // What a TM sees. 'Guest laminate', not 'guest_laminate'.
  label: string
}

// Who the guest is: the bucket the TM sorts by when the list is over and
// something has to be cut. Nullable in the database with no default, because a
// chat request never asks for it, so there is no 'unknown' member here: an
// untyped entry is a null, not a value in this list.
export const GUEST_TYPES = [
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friend' },
  { value: 'industry', label: 'Industry' },
  { value: 'media', label: 'Media' },
  { value: 'promoter', label: 'Promoter' },
  { value: 'support', label: 'Support' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly VocabularyOption<string>[]

// What they get: what an allotment counts against. 'ticket' is the default in
// the database, because only the band are asked which pass they want.
export const PASS_TYPES = [
  { value: 'ticket', label: 'Ticket' },
  { value: 'guest_laminate', label: 'Guest laminate' },
  { value: 'aaa', label: 'AAA' },
  { value: 'photo_pass', label: 'Photo pass' },
  { value: 'aftershow', label: 'Aftershow' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly VocabularyOption<string>[]

// Where they collect. 'will call' is dropped as an Americanism; 'other' plus a
// detail line covers "stage door, ask for Mick".
export const PICKUPS = [
  { value: 'box_office', label: 'Box office' },
  { value: 'production_office', label: 'Production office' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly VocabularyOption<string>[]

export type GuestType = (typeof GUEST_TYPES)[number]['value']
export type PassType = (typeof PASS_TYPES)[number]['value']
export type Pickup = (typeof PICKUPS)[number]['value']

// The raw value lists, for validators and anything that needs to check a value
// without walking the objects.
export const GUEST_TYPE_VALUES: readonly GuestType[] = GUEST_TYPES.map((o) => o.value)
export const PASS_TYPE_VALUES: readonly PassType[] = PASS_TYPES.map((o) => o.value)
export const PICKUP_VALUES: readonly Pickup[] = PICKUPS.map((o) => o.value)

const GUEST_TYPE_LABELS = new Map(GUEST_TYPES.map((o) => [o.value, o.label]))
const PASS_TYPE_LABELS = new Map(PASS_TYPES.map((o) => [o.value, o.label]))
const PICKUP_LABELS = new Map(PICKUPS.map((o) => [o.value, o.label]))

// A value's label, or the raw value if it is unknown. The raw value is
// deliberately ugly on screen, because a value missing from this list is a bug
// and should look like one rather than being quietly tidied up.
export function guestTypeLabel(value: string): string {
  return GUEST_TYPE_LABELS.get(value as GuestType) ?? value
}

export function passTypeLabel(value: string): string {
  return PASS_TYPE_LABELS.get(value as PassType) ?? value
}

export function pickupLabel(value: string): string {
  return PICKUP_LABELS.get(value as Pickup) ?? value
}
