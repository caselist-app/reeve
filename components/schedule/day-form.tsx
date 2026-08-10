'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { PanelShell } from '@/components/layout/panel-shell'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { useEntityForm } from '@/hooks/use-entity-form'
import { createDayItem } from '@/lib/actions/day-items'
import { getCustomDayItemTitles } from '@/lib/actions/day-item-titles'
import { parseDayItem } from '@/lib/schedule/parse-day-item'
import { DAY_ITEM_KINDS, dayItemLabel } from '@/lib/schedule/day-item-kinds'

interface DayFormProps {
  tourId: string
  tourDateId: string
  // Pre-filled line, set when the form opens from a click on empty grid space
  // (REE-56): the snapped wall-clock time. The TM types the label after it. The
  // parser reads it exactly as if it had been typed, so nothing special happens
  // downstream; this only seeds the input.
  initialInput?: string
}

// One resolved option in the combo box: a known kind, a remembered custom title,
// or the generic Custom fallback. The clocks are wall time the parser read off
// the line; the action resolves which calendar day they fall on with the rest of
// the day in hand, so nothing here needs the timezone.
interface DayFormOption {
  kind: string
  // What the row shows. A kind's label, a remembered title, or 'Custom'.
  label: string
  // What the item is actually titled once committed. Null for a bare known kind.
  title: string | null
  startClock: string | null
  endClock: string | null
  // The generic 'Custom' catch-all, always rendered last and never the default
  // highlight, so a recognised kind is never out-ranked by 'this is custom'.
  isGenericCustom: boolean
}

// The interpreted time, for the preview and each row. An item with no time is a
// real thing (day_items.starts_at is nullable), so it reads as pending rather
// than as an error.
function timeLabel(option: DayFormOption): string {
  if (!option.startClock) return 'no time yet'
  return option.endClock ? `${option.startClock}–${option.endClock}` : option.startClock
}

// The typed fast path for a day item (REE-22). The parser in parse-day-item.ts
// does the reading and the ranking; this component is a thin combo box over it,
// deliberately, because there is no way to render-test a component in this repo
// (no jsdom, no testing-library) and the acceptance criteria are the brief.
//
// It commits a day_items row and nothing else. A flight, drive, rail or hotel
// has structure beyond a time and stays behind the '+' picker's own forms: if
// this input ever tries to swallow one, it has gone wrong.
export function DayForm({ tourId, tourDateId, initialInput }: DayFormProps) {
  const { close } = useSidePanel()
  const inputRef = useRef<HTMLInputElement>(null)

  const [input, setInput] = useState(initialInput ?? '')
  const [selected, setSelected] = useState(0)
  const [customTitles, setCustomTitles] = useState<string[]>([])
  const [, startLoad] = useTransition()

  // Remembered custom titles, fetched once when the panel opens rather than
  // baked into the day-view render, so an unopened panel costs the schedule
  // nothing. A failed fetch leaves the list empty; typing a new title still
  // works, which is the point.
  useEffect(() => {
    startLoad(async () => {
      setCustomTitles(await getCustomDayItemTitles(tourId))
    })
  }, [tourId])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const options = useMemo<DayFormOption[]>(() => {
    const trimmed = input.trim()
    const list: DayFormOption[] = []

    // Empty input offers the whole kind list in its chronological order (the
    // order day-item-kinds.ts is deliberately kept in), then any remembered
    // titles, then Custom last.
    if (!trimmed) {
      for (const kind of DAY_ITEM_KINDS) {
        if (kind.kind === 'other') continue
        list.push({ kind: kind.kind, label: kind.label, title: null, startClock: null, endClock: null, isGenericCustom: false })
      }
      for (const title of customTitles) {
        list.push({ kind: 'other', label: title, title, startClock: null, endClock: null, isGenericCustom: false })
      }
      list.push({ kind: 'other', label: 'Custom', title: null, startClock: null, endClock: null, isGenericCustom: true })
      return list
    }

    const { best, alternatives } = parseDayItem(trimmed)
    const parsed = [best, ...alternatives]
    // The parser always includes an 'other' candidate; it carries the residual
    // text and the time, which the remembered and generic rows reuse.
    const other = parsed.find((candidate) => candidate.kind === 'other') ?? null
    const residual = other?.title ?? null
    const hasKindMatch = parsed.some((candidate) => candidate.kind !== 'other')

    // A line that is only a time, with no kind word and no residual text, is what
    // clicking empty grid space produces (REE-56 pre-fills the snapped clock),
    // and what typing a bare '15:15' produces too. Collapsing it to Custom would
    // make every click-to-add a custom item; instead offer the whole kind list at
    // that time, exactly like the empty state but timed, so the TM picks Load-in
    // rather than defaulting to a custom block.
    if (!hasKindMatch && other?.startClock && !residual) {
      for (const kind of DAY_ITEM_KINDS) {
        if (kind.kind === 'other') continue
        list.push({ kind: kind.kind, label: kind.label, title: null, startClock: other.startClock, endClock: other.endClock, isGenericCustom: false })
      }
      for (const title of customTitles) {
        list.push({ kind: 'other', label: title, title, startClock: other.startClock, endClock: other.endClock, isGenericCustom: false })
      }
      list.push({ kind: 'other', label: 'Custom', title: null, startClock: other.startClock, endClock: other.endClock, isGenericCustom: true })
      return list
    }

    for (const candidate of parsed) {
      if (candidate.kind === 'other') continue
      list.push({
        kind: candidate.kind,
        label: dayItemLabel(candidate.kind),
        title: candidate.title,
        startClock: candidate.startClock,
        endClock: candidate.endClock,
        isGenericCustom: false,
      })
    }

    // Remembered titles that match what is left after the alias and time are
    // removed, so 'after' surfaces a stored 'After show'. The exact match is
    // left to the generic row below rather than duplicated here.
    if (residual) {
      const query = residual.toLowerCase()
      for (const title of customTitles) {
        const lower = title.toLowerCase()
        if (lower === query) continue
        if (lower.includes(query)) {
          list.push({ kind: 'other', label: title, title, startClock: other?.startClock ?? null, endClock: other?.endClock ?? null, isGenericCustom: false })
        }
      }
    }

    // The generic Custom, always last. Its title is the residual text, so
    // 'meet and greet 5.30pm' commits as a custom item titled 'Meet and greet'.
    list.push({
      kind: 'other',
      label: residual ? `Custom: “${residual}”` : 'Custom',
      title: residual,
      startClock: other?.startClock ?? null,
      endClock: other?.endClock ?? null,
      isGenericCustom: true,
    })

    return list
  }, [input, customTitles])

  // Index 0 is always a recognised kind or a remembered title (the generic
  // Custom is pushed last), so the default highlight is never Custom unless it
  // is the only option there is.
  const clamped = options.length > 0 ? Math.min(selected, options.length - 1) : 0
  const active = options[clamped] ?? null

  // The option a submit will commit. Kept in a ref because a row click sets it
  // and submits in the same tick, before React re-renders the selection: reading
  // selection state from the action's closure would commit the previously
  // highlighted row instead of the clicked one. Enter and the button fall back
  // to whatever is highlighted, which this effect keeps in step.
  const commitRef = useRef<DayFormOption | null>(active)
  useEffect(() => { commitRef.current = active }, [active])

  const { submit, pending, error } = useEntityForm({
    refreshOnSuccess: true,
    onSuccess: close,
    action: async () => {
      const option = commitRef.current
      if (!option) return { error: 'Type what is happening, for example load in 2pm.' }
      return createDayItem({
        tour_id: tourId,
        tour_date_id: tourDateId,
        kind: option.kind,
        title: option.title,
        start_clock: option.startClock,
        end_clock: option.endClock,
      })
    },
  })

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((current) => Math.min(current + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((current) => Math.max(current - 1, 0))
    }
    // Enter is left to the form's submit, so it commits whatever is highlighted.
  }

  function commitOption(option: DayFormOption, index: number) {
    commitRef.current = option
    setSelected(index)
    inputRef.current?.form?.requestSubmit()
  }

  return (
    <PanelShell title="Add to day" description="Type what is happening. Enter adds it.">
      <form onSubmit={submit} className="space-y-3">
        <Input
          ref={inputRef}
          value={input}
          onChange={(event) => { setInput(event.target.value); setSelected(0) }}
          onKeyDown={onInputKeyDown}
          placeholder={'Try "load in 2pm" or "Tesseract sound 3-4pm"'}
          className="h-9 text-sm"
          autoComplete="off"
        />

        {/* Preview: what the highlighted option will actually store. */}
        {active && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <span className="font-medium">{active.title ?? active.label}</span>
            {active.kind !== 'other' && active.title && (
              <span className="text-muted-foreground"> · {active.label}</span>
            )}
            <span className="text-muted-foreground"> · {timeLabel(active)}</span>
          </div>
        )}

        <ul className="max-h-64 overflow-y-auto">
          {options.map((option, index) => (
            <li key={`${option.kind}-${option.label}-${index}`}>
              <button
                type="button"
                onMouseEnter={() => setSelected(index)}
                onClick={() => commitOption(option, index)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  index === clamped ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                )}
              >
                <span className="flex-1 truncate font-medium">{option.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(option)}</span>
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? 'Adding...' : 'Add to day'}
        </Button>
      </form>
    </PanelShell>
  )
}
