import { z } from 'zod'
import {
  GUEST_TYPE_VALUES,
  PASS_TYPE_VALUES,
  PICKUP_VALUES,
  type GuestType,
  type PassType,
  type Pickup,
} from '@/lib/guest-list/vocabulary'

// Action-facing schemas for the guest list. Brief 52, step 3 (REE-130).
//
// The three vocabularies (guest_type, pass_type, pickup) live in
// lib/guest-list/vocabulary.ts and are checked here with a refine rather than
// z.enum. The VALUES arrays are readonly string[] and z.enum needs a non-empty
// tuple, so a z.enum would mean a cast that asserts the list is non-empty, which
// is true until someone edits the list. The database's check constraints have
// the last word; this exists so a bad value reads as a sentence, the same shape
// lib/validators/day-item.ts uses for the day-item kind list.
//
// NO .default() ANYWHERE, and check:conventions fails the build on one in this
// directory. A default is the exact bug that wiped six catering columns: it
// invents a value for a key a partial form never submitted. num_tickets and
// pass_type carry their fallback in the database (not null default) and, on the
// TM's add, at the action's call site. Never here.

// Trimmed, empty-after-trim reads as cleared. Nullable is "the TM cleared it",
// undefined is "the form never sent it": the partial-write convention the whole
// of this file exists to keep. Same field as day-item's textField.
const textField = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional()

// An email is validated only when present. Empty-after-trim collapses to null
// first, so clearing the field is not an "invalid email" error.
const emailField = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional()
  .refine((v) => v == null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: 'That does not look like an email address.',
  })

// guest_type and pickup are nullable in the database (no default), so their
// fields allow null. pass_type is not null, so its field does not.
const guestTypeField = z
  .string()
  .refine((v): v is GuestType => (GUEST_TYPE_VALUES as readonly string[]).includes(v), {
    message: 'That is not a guest type Reeve knows.',
  })
  .nullable()
  .optional()

const pickupField = z
  .string()
  .refine((v): v is Pickup => (PICKUP_VALUES as readonly string[]).includes(v), {
    message: 'That is not a pickup point Reeve knows.',
  })
  .nullable()
  .optional()

const passTypeField = z
  .string()
  .refine((v): v is PassType => (PASS_TYPE_VALUES as readonly string[]).includes(v), {
    message: 'That is not a pass type Reeve knows.',
  })
  .optional()

// The shape only. Cross-field rules (a detail line required when the value is
// 'other', both names required on a non-draft row) are enforced by the database
// check constraints and, where a friendlier message is worth it, in the action
// against the merged row. An update can submit a pass type without mentioning
// the detail it already has, so a rule on the payload alone would reject a valid
// save.
const guestEntryBase = z.object({
  first_name: textField,
  last_name: textField,
  email: emailField,
  guest_type: guestTypeField,
  num_tickets: z
    .number()
    .int('Tickets must be a whole number.')
    .min(1, 'A guest needs at least one ticket.')
    .optional(),
  pass_type: passTypeField,
  pass_type_detail: textField,
  pickup: pickupField,
  pickup_detail: textField,
  priority: z.boolean().optional(),
  notes: textField,
})

// The TM's own add. tour_id and show_id are required and are the two ids the
// action checks belong to the same tour before writing them together.
export const createGuestEntrySchema = guestEntryBase.extend({
  tour_id: z.string().uuid(),
  show_id: z.string().uuid(),
})

// show_id and tour_id are omitted rather than made optional. Moving an entry to
// another show is not this issue, and leaving them settable but unhandled would
// let a caller repoint an entry at another show while keeping its old scope.
export const updateGuestEntrySchema = guestEntryBase.partial()

// The three setter actions take positional arguments rather than a form DTO, so
// their schemas validate the assembled object inside the action.
export const guestListAllotmentSchema = z.object({
  show_id: z.string().uuid(),
  pass_type: z
    .string()
    .refine((v): v is PassType => (PASS_TYPE_VALUES as readonly string[]).includes(v), {
      message: 'That is not a pass type Reeve knows.',
    }),
  // 0 is a real value meaning "none allowed", distinct from no row meaning "no
  // limit". min(0) not min(1).
  num_allowed: z.number().int('An allotment must be a whole number.').min(0, 'An allotment cannot be negative.'),
})

export const guestListCutoffSchema = z.object({
  show_id: z.string().uuid(),
  // Null clears the cutoff. A datetime string sets it.
  cutoff_at: z.string().datetime({ offset: true }).nullable(),
})

export const guestListLockSchema = z.object({
  show_id: z.string().uuid(),
  locked: z.boolean(),
})

export type CreateGuestEntryForm = z.infer<typeof createGuestEntrySchema>
export type UpdateGuestEntryForm = z.infer<typeof updateGuestEntrySchema>
