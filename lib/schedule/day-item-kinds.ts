// Brief 42. The one list of what can be on a day.
//
// Before this file, adding one field to a day meant editing twelve places, two
// of which were plain PostgREST select strings that no compiler checks. Brief 36
// was called One Fact, One Place; this is the part of it that was left. The combo
// box, the timeline, the comms templates, the parser and the database check
// constraint all read this array and nothing else.
//
// THE ARRAY ORDER IS LOAD BEARING. Two separate things depend on it:
//
//   1. resolveDayOffsets walks the crossesMidnight kinds in order and treats the
//      clock going backwards as evidence of midnight. That walk is only correct
//      while those kinds are in the order they actually occur: a support act
//      finishes before the changeover, which finishes before the headliner goes
//      on. Reordering them looks cosmetic and silently breaks Brief 40's rule,
//      which is why tests/unit/day-item-kinds.test.ts pins the sequence.
//   2. The combo box offers kinds in this order when the input is empty.
//
// So: add a kind in its chronological place, never at the end for convenience.
//
// The eighteen kinds are exactly the seventeen that existed as day_sheets
// columns plus 'other'. No speculative kinds, not even press, even though press
// is already a tour_dates.day_type. The mechanism for finding out what deserves
// promoting is what TMs actually type into 'other' (decision 8), not a guess
// made here.

export interface DayItemKind {
  // Matches the day_items check constraint exactly. scripts/check-conventions.mjs
  // rule 10 fails the build if this array and the migration ever disagree.
  kind: string
  // What a TM sees. 'Load-in', not 'load_in'.
  label: string
  // What a TM might type. Matched longest first, so 'load out' beats 'load'.
  // Lower case, no punctuation: the parser normalises the input the same way.
  aliases: string[]
  // Semantic, not a colour. The render site maps it to a class, because the card
  // token and the timeline's accent classes live in components, not here.
  accent: 'show' | 'catering' | 'other'
  // Was DAYTIME_FIELDS versus EVENING_FIELDS in lib/schedule/day-sheet-times.ts.
  // True means a time earlier than the day's latest daytime time has crossed
  // midnight and belongs to the following morning.
  crossesMidnight: boolean
  // How a bare hour resolves. 'load 2' is 14:00, 'lobby 5' is 05:00. There is no
  // group rule that gets both right, because load-in and lobby call are both
  // daytime and resolve opposite ways, so it is a per-kind judgement.
  //
  // Every one of these is a GUESS. It is only acceptable because the day form
  // previews the resolved time before committing, so a festival load-in at 6am
  // shows as 18:00, the TM sees it and types '6am'. An explicit meridiem, a
  // 24-hour time, or any hour of 12 or above always wins over this. Log the
  // corrections and tune the list from real data rather than argument.
  defaultMeridiem: 'am' | 'pm'
  // Comms render the start time only: 'Load-in 10:00', never a range, because a
  // TM does not talk in ranges. The carve-out is catering, where a window that
  // does not say when it shuts is worse than useless.
  surfaceEndInComms: boolean
  // Lucide component name, PascalCase. Nothing reads this yet: TimelineCard has
  // no icon prop today. It is here because Brief 43's grid blocks need it and
  // because defining it once is the whole point of this file. Every name below
  // was checked against the installed lucide-react.
  icon: string
}

export const DAY_ITEM_KINDS: readonly DayItemKind[] = [
  {
    kind: 'lobby_call',
    label: 'Lobby call',
    aliases: ['lobby call', 'lobby', 'lobbycall'],
    accent: 'show',
    crossesMidnight: false,
    // The canonical early case. A 05:00 lobby call is a morning event on the
    // show day, and the TM leaving for an early flight is not doing it tomorrow.
    defaultMeridiem: 'am',
    surfaceEndInComms: false,
    icon: 'BellRing',
  },
  {
    kind: 'catering_breakfast',
    label: 'Breakfast',
    aliases: ['breakfast', 'brekky', 'bfast'],
    accent: 'catering',
    crossesMidnight: false,
    defaultMeridiem: 'am',
    surfaceEndInComms: true,
    icon: 'Coffee',
  },
  {
    kind: 'venue_access',
    label: 'Venue access',
    aliases: ['venue access', 'venue', 'access'],
    accent: 'show',
    crossesMidnight: false,
    // The first thing that happens at the building, so am. This is the weakest
    // guess in the list: a 14:00 venue access typed as 'venue 2' previews as
    // 02:00, which is obviously wrong on screen and one retype to fix.
    defaultMeridiem: 'am',
    surfaceEndInComms: false,
    icon: 'DoorOpen',
  },
  {
    kind: 'load_in',
    label: 'Load-in',
    aliases: ['load in', 'load-in', 'loadin', 'load', 'li'],
    accent: 'show',
    crossesMidnight: false,
    // 'load 2' is 14:00. Named in the brief.
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Truck',
  },
  {
    kind: 'line_check',
    label: 'Line check',
    aliases: ['line check', 'linecheck', 'lines'],
    accent: 'show',
    crossesMidnight: false,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Cable',
  },
  {
    kind: 'catering_lunch',
    label: 'Lunch',
    aliases: ['lunch'],
    accent: 'catering',
    crossesMidnight: false,
    defaultMeridiem: 'pm',
    surfaceEndInComms: true,
    icon: 'Sandwich',
  },
  {
    kind: 'soundcheck',
    label: 'Soundcheck',
    aliases: ['soundcheck', 'sound check', 'sound'],
    accent: 'show',
    crossesMidnight: false,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Mic',
  },
  {
    kind: 'vip',
    label: 'VIP',
    aliases: ['vip', 'vips'],
    accent: 'show',
    crossesMidnight: false,
    // Deliberately NOT aliased to 'meet and greet'. The brief's case table
    // requires 'meet and greet 5.30pm' to become a custom item titled Meet and
    // greet, because that is a real thing a TM types and VIP is a different one.
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Star',
  },
  {
    kind: 'catering_dinner',
    label: 'Dinner',
    aliases: ['dinner', 'catering', 'meal'],
    accent: 'catering',
    crossesMidnight: false,
    defaultMeridiem: 'pm',
    surfaceEndInComms: true,
    icon: 'Utensils',
  },
  {
    kind: 'doors',
    label: 'Doors',
    aliases: ['doors', 'door'],
    accent: 'show',
    crossesMidnight: false,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Users',
  },
  {
    kind: 'support_on',
    label: 'Support on',
    // Bare 'support' resolves to the start, which is the one a TM sets more
    // often. 'support off' is longer and therefore wins its own match.
    aliases: ['support on', 'support onstage', 'support', 'opener on'],
    accent: 'show',
    crossesMidnight: false,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Music',
  },

  // ---- Everything below can cross midnight, in the order it occurs. ---------
  // This run is genuinely chronological and resolveDayOffsets depends on it.

  {
    kind: 'support_off',
    label: 'Support off',
    aliases: ['support off', 'support offstage', 'opener off'],
    accent: 'show',
    crossesMidnight: true,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Music',
  },
  {
    kind: 'changeover',
    label: 'Changeover',
    aliases: ['changeover', 'change over', 'turnaround'],
    accent: 'show',
    crossesMidnight: true,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'RefreshCw',
  },
  {
    kind: 'headliner_on',
    label: 'Headliner on',
    aliases: ['headliner on', 'headline on', 'stage time', 'set time', 'onstage', 'showtime'],
    accent: 'show',
    crossesMidnight: true,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Volume2',
  },
  {
    kind: 'headliner_off',
    label: 'Headliner off',
    aliases: ['headliner off', 'headline off', 'offstage', 'set end'],
    accent: 'show',
    crossesMidnight: true,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Volume2',
  },
  {
    kind: 'curfew',
    label: 'Curfew',
    aliases: ['curfew'],
    accent: 'show',
    crossesMidnight: true,
    // 'curfew 11' is 23:00. Named in the brief.
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Clock',
  },
  {
    kind: 'load_out',
    label: 'Load-out',
    aliases: ['load out', 'load-out', 'loadout'],
    accent: 'show',
    crossesMidnight: true,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'Truck',
  },

  // ---- Free text. Always last, and never the highlighted default. ----------

  {
    kind: 'other',
    label: 'Custom',
    // No aliases: 'other' is what a TM gets when nothing else matched, so it is
    // reached by the parser's fallback rather than by name.
    aliases: [],
    accent: 'other',
    // False, and this is the one judgement in the list with no precedent to
    // follow. day_events carries an explicit timestamp from a form today and no
    // roll-over logic touches it, so false preserves exactly what happens now.
    // The cost is that an after-show party typed as '1am' lands at 01:00 that
    // morning rather than the following one. The preview row shows the time
    // either way, and promoting a popular custom title to a real kind is how
    // that gets fixed properly.
    crossesMidnight: false,
    defaultMeridiem: 'pm',
    surfaceEndInComms: false,
    icon: 'CircleDashed',
  },
]

// Every kind name, in list order. Used by the conventions check and by anything
// that needs to validate a kind without walking the objects.
export const DAY_ITEM_KIND_NAMES: readonly string[] = DAY_ITEM_KINDS.map((k) => k.kind)

const BY_KIND = new Map(DAY_ITEM_KINDS.map((k) => [k.kind, k]))

/**
 * The definition for a stored kind, or undefined if the database holds a kind
 * this build does not know about.
 *
 * Returns undefined rather than falling back to 'other', deliberately. A row
 * whose kind is not in this list means the check constraint and this array have
 * come apart, and rendering it as a custom item would hide that. Callers decide
 * what to show; they must not silently relabel it.
 */
export function dayItemKind(kind: string): DayItemKind | undefined {
  return BY_KIND.get(kind)
}

/**
 * A kind's label, or the raw kind if it is unknown.
 *
 * The raw kind is deliberately ugly on screen ('press_call' rather than 'Press
 * call'), because a kind missing from this list is a bug and should look like
 * one rather than being quietly tidied up.
 */
export function dayItemLabel(kind: string): string {
  return BY_KIND.get(kind)?.label ?? kind
}
