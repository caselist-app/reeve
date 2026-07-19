// Block-selection engine for the day-message job.
//
// A block fires because its underlying data exists for that date, not because
// a day_type flag says so. Each selector is pure and side-effect free so it
// is trivially unit-testable. The job fetches the data; these functions decide
// what to send.
//
// Show day only in this brief. Rehearsal, travel, press, and day-off blocks
// are flagged for future work (rehearsal in particular needs schema Reeve does
// not have yet: session structure, lobby call, pack-down).

// The four day_sheets columns the show-info block reads.
export type ShowInfoInput = {
  load_in: string | null
  soundcheck: string | null
  changeover: string | null
  headliner_on: string | null
}

// Which Meta template to select for the show-info block.
// 'full'          - load in, soundcheck, changeover, show
// 'no_soundcheck' - load in, changeover, show
// 'no_changeover' - load in, soundcheck, show
// 'minimal'       - load in, show only
// null            - no show info to send (neither load_in nor headliner_on)
export type ShowInfoVariant = 'full' | 'no_soundcheck' | 'no_changeover' | 'minimal'

export function selectShowInfoVariant(d: ShowInfoInput): ShowInfoVariant | null {
  if (!d.load_in && !d.headliner_on) return null
  if (d.soundcheck && d.changeover) return 'full'
  if (!d.soundcheck && d.changeover) return 'no_soundcheck'
  if (d.soundcheck && !d.changeover) return 'no_changeover'
  return 'minimal'
}

// The catering fields the catering block reads.
export type CateringInput = {
  catering_type: string
  catering_breakfast_start: string | null
}

// Which Meta template to select for the catering block.
// 'full'         - breakfast, lunch, dinner windows
// 'no_breakfast' - lunch and dinner windows only
// 'buyout'       - static buyout reminder, no variables
// null           - no catering send (catering_type = 'none')
export type CateringVariant = 'full' | 'no_breakfast' | 'buyout'

export function selectCateringVariant(d: CateringInput): CateringVariant | null {
  if (d.catering_type === 'buyout') return 'buyout'
  if (d.catering_type === 'none') return null
  // catering_type === 'provided'
  return d.catering_breakfast_start ? 'full' : 'no_breakfast'
}

// The curfew and optional onward transport leg the wrap block reads.
export type WrapOnwardLeg = {
  mode: string
  destination: string | null
  depart_at: string
}

// Which Meta template to select for the wrap block.
// 'travel' - curfew plus an onward leg departing after it
// 'static' - curfew only
// null     - nothing to send (no curfew and no onward leg)
export type WrapVariant = 'travel' | 'static'

export function selectWrapVariant(
  curfew: string | null,
  onwardLeg: WrapOnwardLeg | null
): WrapVariant | null {
  if (!curfew && !onwardLeg) return null
  return onwardLeg ? 'travel' : 'static'
}

// The full input the block plan resolution reads from the day sheet.
export type DayBlockInput = ShowInfoInput &
  CateringInput & {
    catering_lunch_start: string | null
    catering_dinner_start: string | null
    curfew: string | null
  }

// Which block types fire today, in send order.
// 'opener' is only included when at least one other block fires.
// The caller supplies the resolved onward travel leg separately because it
// requires a transport_assignments query (not a day_sheets column).
export type BlockType = 'opener' | 'show_information' | 'catering' | 'wrap'

export function resolveDayBlocks(
  d: DayBlockInput,
  onwardLeg: WrapOnwardLeg | null
): BlockType[] {
  const blocks: BlockType[] = []

  if (selectShowInfoVariant(d) !== null) blocks.push('show_information')
  if (selectCateringVariant(d) !== null) blocks.push('catering')
  if (selectWrapVariant(d.curfew, onwardLeg) !== null) blocks.push('wrap')

  if (blocks.length > 0) blocks.unshift('opener')

  return blocks
}
