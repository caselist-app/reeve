// Lightweight natural-language date parsing for the Add Flight date step.
// Hand-rolled rather than a new dependency (chrono-node etc.): the brief only
// asks for numeric and weekday-name input, which this covers without pulling
// in a general-purpose NL date library.
//
// Assumes day-before-month for ambiguous numeric input (3/8 = 3 August), the
// UK convention Reeve is built around (per CLAUDE.md: UK WhatsApp number,
// .co.uk-adjacent conventions elsewhere). Not configurable per-locale yet.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]
const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export type ParsedFlightDate = {
  date: string   // YYYY-MM-DD
  label: string  // e.g. "Mon, 3 Aug"
}

function toIsoDate(y: number, m: number, d: number): string {
  const mm = String(m + 1).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

function labelFor(iso: string): string {
  // Construct at noon UTC to sidestep DST/timezone edge cases affecting the
  // displayed calendar date.
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function findMonthIndex(token: string): number | null {
  const t = token.toLowerCase()
  const full = MONTHS.indexOf(t)
  if (full >= 0) return full
  const abbr = MONTH_ABBR.indexOf(t.slice(0, 3))
  return abbr >= 0 ? abbr : null
}

function findWeekdayIndex(token: string): number | null {
  const t = token.toLowerCase()
  const full = WEEKDAYS.indexOf(t)
  if (full >= 0) return full
  const abbr = WEEKDAY_ABBR.indexOf(t.slice(0, 3))
  return abbr >= 0 ? abbr : null
}

// Returns the next date (today included) that falls on the given weekday.
function nextWeekday(now: Date, weekday: number): Date {
  const result = new Date(now)
  const diff = (weekday - result.getDay() + 7) % 7
  result.setDate(result.getDate() + diff)
  return result
}

export function parseFlightDate(input: string, now: Date = new Date()): ParsedFlightDate | null {
  const raw = input.trim().toLowerCase()
  if (!raw) return null

  if (raw === 'today') {
    const iso = toIsoDate(now.getFullYear(), now.getMonth(), now.getDate())
    return { date: iso, label: labelFor(iso) }
  }

  if (raw === 'tomorrow') {
    const t = new Date(now)
    t.setDate(t.getDate() + 1)
    const iso = toIsoDate(t.getFullYear(), t.getMonth(), t.getDate())
    return { date: iso, label: labelFor(iso) }
  }

  // ISO: 2026-08-03
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    const iso = toIsoDate(Number(y), Number(m) - 1, Number(d))
    return { date: iso, label: labelFor(iso) }
  }

  // Weekday name, optionally prefixed with "next": "monday", "next mon"
  const weekdayMatch = raw.match(/^(?:next\s+)?([a-z]+)$/)
  if (weekdayMatch) {
    const wd = findWeekdayIndex(weekdayMatch[1])
    if (wd !== null) {
      let d = nextWeekday(now, wd)
      // "next monday" always means the coming one, not today even if today matches.
      if (raw.startsWith('next') && d.toDateString() === now.toDateString()) {
        d = new Date(d)
        d.setDate(d.getDate() + 7)
      }
      const iso = toIsoDate(d.getFullYear(), d.getMonth(), d.getDate())
      return { date: iso, label: labelFor(iso) }
    }
  }

  // "3 aug", "3 august", "aug 3", "august 3rd"
  const dayMonthMatch = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/)
  const monthDayMatch = raw.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/)
  const dmMatch = dayMonthMatch
    ? { day: Number(dayMonthMatch[1]), monthToken: dayMonthMatch[2] }
    : monthDayMatch
      ? { day: Number(monthDayMatch[2]), monthToken: monthDayMatch[1] }
      : null

  if (dmMatch) {
    const month = findMonthIndex(dmMatch.monthToken)
    if (month !== null && dmMatch.day >= 1 && dmMatch.day <= 31) {
      // Assume the next occurrence of that day/month on or after today,
      // rolling into next year if it's already passed this year.
      let year = now.getFullYear()
      let candidate = new Date(year, month, dmMatch.day)
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (candidate < today) {
        year += 1
        candidate = new Date(year, month, dmMatch.day)
      }
      const iso = toIsoDate(candidate.getFullYear(), candidate.getMonth(), candidate.getDate())
      return { date: iso, label: labelFor(iso) }
    }
  }

  // Numeric day/month: "3/8", "03/08/2026", "3-8". Day-before-month (UK).
  const numericMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (numericMatch) {
    const [, dStr, mStr, yStr] = numericMatch
    const day = Number(dStr)
    const month = Number(mStr) - 1
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      let year = yStr ? (yStr.length === 2 ? 2000 + Number(yStr) : Number(yStr)) : now.getFullYear()
      if (!yStr) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const candidate = new Date(year, month, day)
        if (candidate < today) year += 1
      }
      const iso = toIsoDate(year, month, day)
      return { date: iso, label: labelFor(iso) }
    }
  }

  return null
}
