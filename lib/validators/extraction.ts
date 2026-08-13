import { z } from 'zod'
import type { ExtractionProposal } from '@/lib/ai/extract'
import { CREATED_AS_VALUES } from '@/lib/party/presets'

// The keep argument confirmExtraction takes (REE-154): which proposed rows the
// TM toggled on in the review panel, by index into the arrays proposed_rows
// already holds server-side. Never the row data itself: the TM edits nothing
// in this pass, only keeps or discards, so there is nothing to validate about
// row content, only which indices are in range.
export const extractionKeepSchema = z.object({
  shows: z.array(z.number().int().nonnegative()),
  transport_segments: z.array(z.number().int().nonnegative()),
  hotel_stays: z.array(z.number().int().nonnegative()),
})

export type ExtractionKeep = z.infer<typeof extractionKeepSchema>

// REE-169: the party a kept transport_segment or hotel_stay row applies to,
// keyed by the same original proposed_rows index `keep` above uses (a
// string key, since object keys are always strings; confirmExtraction looks
// this up with String(index)). Optional and additive: a row with no entry
// here still saves, with zero assignment rows, the same as before this
// existed. created_as is checked against CREATED_AS_VALUES rather than a
// second hand-copied literal list, so it cannot drift from the check
// constraint that list is already tied to.
const partySelectionSchema = z.object({
  people: z.array(z.string().uuid()),
  created_as: z
    .string()
    .refine((v): v is (typeof CREATED_AS_VALUES)[number] => (CREATED_AS_VALUES as readonly string[]).includes(v))
    .optional(),
})

export type ExtractionPartySelection = z.infer<typeof partySelectionSchema>

export const extractionPartySchema = z.object({
  transport_segments: z.record(z.string(), partySelectionSchema).optional(),
  hotel_stays: z.record(z.string(), partySelectionSchema).optional(),
})

export type ExtractionParty = z.infer<typeof extractionPartySchema>

export type NarrowExtractionResult =
  | { proposal: ExtractionProposal; error: null }
  | { proposal: null; error: string }

// Picks the rows at `indices` out of `source`, or an error naming the first
// index that falls outside it. `label` identifies the array in the message.
function pick<T>(
  source: readonly T[],
  indices: readonly number[],
  label: string
): { rows: T[]; error: null } | { rows: null; error: string } {
  const rows: T[] = []
  for (const index of indices) {
    if (index < 0 || index >= source.length) {
      return { rows: null, error: `${label} index ${index} is out of range.` }
    }
    rows.push(source[index])
  }
  return { rows, error: null }
}

// Narrows a full proposal down to the rows the TM kept. Pure: no I/O, so
// confirmExtraction can validate the TM's selection before writing anything.
// An index outside the array it indexes into is rejected outright rather than
// silently dropped, because a stale index (the proposal changed shape between
// the TM opening the panel and confirming) is a sign the two disagree about
// what row it points at, not a row to skip.
export function narrowExtractionProposal(
  proposal: ExtractionProposal,
  keep: ExtractionKeep
): NarrowExtractionResult {
  const shows = pick(proposal.shows, keep.shows, 'shows')
  if (shows.rows === null) return { proposal: null, error: shows.error }

  const segments = pick(proposal.transport_segments, keep.transport_segments, 'transport_segments')
  if (segments.rows === null) return { proposal: null, error: segments.error }

  const hotels = pick(proposal.hotel_stays, keep.hotel_stays, 'hotel_stays')
  if (hotels.rows === null) return { proposal: null, error: hotels.error }

  return {
    proposal: { shows: shows.rows, transport_segments: segments.rows, hotel_stays: hotels.rows },
    error: null,
  }
}
