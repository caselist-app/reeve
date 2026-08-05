import { describe, it, expect } from 'vitest'
import { dayItemLine, dayItemLines, type DayItemLine } from '@/lib/comms/day-item-lines'

// Brief 42, REE-20. What a day item reads like in a message to crew.
//
// This is the whole of decision 3 in one file: comms surface the start time
// only, except catering, which surfaces both ends. It is unit tested rather than
// left to the integration suite because it is pure, because it is what a crew
// member actually receives, and because the two templates that use it both run
// on Trigger.dev, where a mistake is invisible on Vercel.
//
// The formatter is passed in, so these assertions are about the sentence rather
// than about timezone arithmetic, which lib/schedule/datetime.ts already owns.
// Europe/London in June is BST, so 17:00Z reads as 18:00, and using a real
// timezone here rather than UTC means a formatter that ignored the zone would
// show up.

const TZ = 'Europe/London'

function formatTime(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

function item(over: Partial<DayItemLine> = {}): DayItemLine {
  return {
    kind: 'load_in',
    title: null,
    starts_at: '2026-06-14T09:00:00.000Z',
    ends_at: null,
    ...over,
  }
}

describe('dayItemLine', () => {
  it('renders a kind and its start time', () => {
    expect(dayItemLine(item(), TZ, formatTime)).toBe('Load-in: 10:00')
  })

  it('does not surface the end of a non-catering item, even when one is set', () => {
    // Decision 3, and the case it exists for. A load-in from 10:00 to 10:15 is a
    // start with an estimate on it, and rendering the range makes it read as a
    // fifteen minute window that shuts.
    const line = dayItemLine(
      item({ starts_at: '2026-06-14T09:00:00.000Z', ends_at: '2026-06-14T09:15:00.000Z' }),
      TZ,
      formatTime,
    )

    expect(line).toBe('Load-in: 10:00')
    expect(line).not.toContain('10:15')
  })

  it('surfaces both ends of a catering window, because that is the point of one', () => {
    const line = dayItemLine(
      item({
        kind: 'catering_dinner',
        starts_at: '2026-06-14T17:00:00.000Z',
        ends_at: '2026-06-14T18:30:00.000Z',
      }),
      TZ,
      formatTime,
    )

    expect(line).toBe('Dinner: 18:00 to 19:30')
  })

  it('renders a catering window with no end as a start, not as a range to TBC', () => {
    const line = dayItemLine(
      item({ kind: 'catering_lunch', starts_at: '2026-06-14T11:00:00.000Z' }),
      TZ,
      formatTime,
    )

    expect(line).toBe('Lunch: 12:00')
    expect(line).not.toContain('TBC')
  })

  it('qualifies a kind with its title, so a second soundcheck says whose it is', () => {
    const line = dayItemLine(
      item({ kind: 'soundcheck', title: 'Tesseract', starts_at: '2026-06-14T14:00:00.000Z' }),
      TZ,
      formatTime,
    )

    expect(line).toBe('Soundcheck (Tesseract): 15:00')
  })

  it('calls a custom item what the TM called it, not "Custom"', () => {
    // 'Custom' is what Reeve calls the kind and not what the thing is. A crew
    // member reading "Custom: 17:30" has learned nothing.
    const line = dayItemLine(
      item({ kind: 'other', title: 'Meet and greet', starts_at: '2026-06-14T16:30:00.000Z' }),
      TZ,
      formatTime,
    )

    expect(line).toBe('Meet and greet: 17:30')
  })

  it('skips an item with no time rather than sending TBC', () => {
    // The old templates printed nine fixed labels and wrote TBC against every
    // empty one, so a show with two times sent seven lines of nothing and pushed
    // the two that mattered off a phone screen.
    expect(dayItemLine(item({ starts_at: null }), TZ, formatTime)).toBeNull()
  })
})

describe('dayItemLines', () => {
  it('renders two items of one kind as two lines, which columns could not', () => {
    const lines = dayItemLines(
      [
        item({ kind: 'soundcheck', title: 'Tesseract', starts_at: '2026-06-14T14:00:00.000Z' }),
        item({ kind: 'soundcheck', title: 'Headliner', starts_at: '2026-06-14T16:00:00.000Z' }),
      ],
      TZ,
      formatTime,
    )

    expect(lines).toEqual(['Soundcheck (Tesseract): 15:00', 'Soundcheck (Headliner): 17:00'])
  })

  it('keeps the order it was handed rather than sorting again', () => {
    // The ordering is a property of the query (starts_at then created_at). A
    // second opinion here would be a second place that decides running order.
    const lines = dayItemLines(
      [
        item({ kind: 'curfew', starts_at: '2026-06-15T00:30:00.000Z' }),
        item({ kind: 'load_in', starts_at: '2026-06-14T09:00:00.000Z' }),
      ],
      TZ,
      formatTime,
    )

    expect(lines).toEqual(['Curfew: 01:30', 'Load-in: 10:00'])
  })

  it('drops the untimed items and keeps the rest', () => {
    const lines = dayItemLines(
      [
        item({ kind: 'load_in', starts_at: '2026-06-14T09:00:00.000Z' }),
        item({ kind: 'soundcheck', starts_at: null }),
        item({ kind: 'doors', starts_at: '2026-06-14T18:00:00.000Z' }),
      ],
      TZ,
      formatTime,
    )

    expect(lines).toEqual(['Load-in: 10:00', 'Doors: 19:00'])
  })

  it('returns nothing for a show with nothing set', () => {
    expect(dayItemLines([], TZ, formatTime)).toEqual([])
  })

  it('does not silently relabel a kind this build does not know', () => {
    // A kind the database allows and the list does not is drift between the two,
    // and dayItemLabel deliberately falls back to the raw kind so it looks like
    // the bug it is rather than being tidied into a plausible sentence.
    const lines = dayItemLines(
      [item({ kind: 'press_call', starts_at: '2026-06-14T11:00:00.000Z' })],
      TZ,
      formatTime,
    )

    expect(lines).toEqual(['press_call: 12:00'])
  })
})
