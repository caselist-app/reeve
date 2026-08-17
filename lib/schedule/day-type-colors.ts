// The one day-type colour map (CLAUDE.md: purple show, teal travel, amber
// press, blue rehearsal, stone off). DateSidebar (desktop) and DateStrip
// (mobile) render the same date chips at different widths, so both read this
// rather than keeping their own copy: two copies is how they drifted apart
// before (REE-72).
export interface DayTypeChipClass {
  box: string
  day: string
  month: string
}

export function dayTypeChipClass(dayType: string): DayTypeChipClass {
  switch (dayType) {
    case 'show':
      return { box: 'bg-purple-100 dark:bg-purple-500/15', day: 'text-purple-900 dark:text-purple-200', month: 'text-purple-700 dark:text-purple-400' }
    case 'travel':
      return { box: 'bg-teal-100 dark:bg-teal-500/15', day: 'text-teal-900 dark:text-teal-200', month: 'text-teal-700 dark:text-teal-400' }
    case 'press':
      return { box: 'bg-amber-100 dark:bg-amber-500/15', day: 'text-amber-900 dark:text-amber-200', month: 'text-amber-700 dark:text-amber-500' }
    case 'rehearsal':
      return { box: 'bg-blue-100 dark:bg-blue-500/15', day: 'text-blue-900 dark:text-blue-200', month: 'text-blue-700 dark:text-blue-400' }
    default:
      return { box: 'bg-stone-100 dark:bg-stone-500/15', day: 'text-stone-700 dark:text-stone-300', month: 'text-stone-500 dark:text-stone-400' }
  }
}
