'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ChevronRight } from 'lucide-react'
import { PanelShell } from '@/components/layout/panel-shell'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useEntityForm } from '@/hooks/use-entity-form'
import { createDayItem } from '@/lib/actions/day-items'
import { getCustomDayItemTitles } from '@/lib/actions/day-item-titles'
import { buildAddOptions, addOptionPreview, type AddOption } from '@/lib/schedule/add-options'

interface DayFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  // Pre-filled line, set when the form opens from a click on empty grid space
  // (REE-56): the snapped wall-clock time. The TM types the label after it. Also
  // carried back across a detour into a book form (REE-88), so the typed line is
  // still there when the picker returns. The parser reads it exactly as if it had
  // been typed, so nothing special happens downstream; this only seeds the input.
  initialInput?: string
}

// The single interpreted time shown on a commit row. addOptionPreview owns the
// full preview line; this is just the trailing clock the row itself carries.
function rowTime(option: Extract<AddOption, { action: 'commit' }>): string {
  if (!option.startClock) return 'no time yet'
  return option.endClock ? `${option.startClock}–${option.endClock}` : option.startClock
}

// Brief 46, "one door into a day" (REE-88). The typed panel is the only add
// surface: a single text input over buildAddOptions, offering two groups. BOOK
// rows (flight, drive, rail, hotel) have structure beyond a time and open their
// own form; TIMES rows (load-in, soundcheck, a custom block) commit a day_items
// row here and now. A preview row says exactly what Enter will do.
//
// The ranking, the parsing and the preview wording all live in lib/schedule so a
// test can reach them (this repo has no way to render-test a component: no jsdom,
// no testing-library). This component is a thin combo box over that.
export function DayForm({ tourId, tourDateId, date, timezone, initialInput }: DayFormProps) {
  const { open: openSidePanel, close } = useSidePanel()
  const isMobile = useIsMobile()
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

  // Autofocus the input on desktop only. On mobile the focus would summon the
  // on-screen keyboard the moment the panel opens, over a category list the TM
  // may only want to tap.
  useEffect(() => {
    if (!isMobile) inputRef.current?.focus()
  }, [isMobile])

  // The ranked rows, split into their two groups. buildAddOptions returns the
  // open rows ahead of the commit rows at equal score (BOOK before TIMES in its
  // resting order), so partitioning preserves the ranking within each group and
  // gives the panel its two sections. The flat order the selection walks is BOOK
  // then TIMES, matching what is rendered.
  const { bookOptions, timeOptions, ordered } = useMemo(() => {
    const options = buildAddOptions(input, customTitles)
    const book = options.filter((option): option is Extract<AddOption, { action: 'open' }> => option.action === 'open')
    const time = options.filter((option): option is Extract<AddOption, { action: 'commit' }> => option.action === 'commit')
    return { bookOptions: book, timeOptions: time, ordered: [...book, ...time] }
  }, [input, customTitles])

  const clamped = ordered.length > 0 ? Math.min(selected, ordered.length - 1) : 0
  const active = ordered[clamped] ?? null

  // The option a submit will commit. Kept in a ref because a row click sets it
  // and submits in the same tick, before React re-renders the selection: reading
  // selection state from the action's closure would commit the previously
  // highlighted row instead of the clicked one. Enter and the button fall back
  // to whatever is highlighted, which this effect keeps in step. Only ever holds
  // a commit row; open rows never reach the form.
  const commitRef = useRef<AddOption | null>(active)
  useEffect(() => { commitRef.current = active }, [active])

  const { submit, pending, error } = useEntityForm({
    refreshOnSuccess: true,
    onSuccess: close,
    action: async () => {
      const option = commitRef.current
      if (!option || option.action !== 'commit') {
        return { error: 'Type what is happening, for example load in 2pm.' }
      }
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

  // A BOOK row leaves this panel for the category's own add form. Back reopens
  // this form with the typed line intact, so the detour into the flight form
  // does not lose what the TM had started typing (REE-88).
  function openBook(option: Extract<AddOption, { action: 'open' }>) {
    openSidePanel({
      type: 'add-to-day',
      tourId,
      tourDateId,
      date,
      timezone,
      category: option.category,
      onBack: () =>
        openSidePanel({ type: 'day-form', tourId, tourDateId, date, timezone, initialInput: input }),
    })
  }

  // Enter, the button and a row click all route here. A BOOK row opens its form;
  // a TIMES row commits through the form so useEntityForm owns the refresh and
  // error state. The two never cross: open rows are kept out of the form path.
  function activate(option: AddOption, index: number) {
    setSelected(index)
    if (option.action === 'open') {
      openBook(option)
      return
    }
    commitRef.current = option
    inputRef.current?.form?.requestSubmit()
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((current) => Math.min(current + 1, ordered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      // Taken fully in hand so an open row never triggers the form's own submit:
      // it would run createDayItem and then close the book form onSuccess just
      // opened.
      event.preventDefault()
      if (active) activate(active, clamped)
    }
  }

  let flatIndex = 0

  return (
    <PanelShell title="Add to day" description="Type what is happening. Enter adds it.">
      <form onSubmit={submit} className="space-y-3">
        <Input
          ref={inputRef}
          value={input}
          onChange={(event) => { setInput(event.target.value); setSelected(0) }}
          onKeyDown={onInputKeyDown}
          placeholder={'Try "load in 2pm" or "flight"'}
          className="h-9 text-sm"
          autoComplete="off"
        />

        {/* Preview: exactly what Enter will do to the highlighted option. */}
        {active && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {addOptionPreview(active)}
          </div>
        )}

        <div className="max-h-72 space-y-3 overflow-y-auto">
          {bookOptions.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Book</p>
              <ul>
                {bookOptions.map((option) => {
                  const index = flatIndex++
                  return (
                    <li key={`open-${option.category}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setSelected(index)}
                        onClick={() => activate(option, index)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          index === clamped ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                        )}
                      >
                        <span className="flex-1 truncate font-medium">{option.label}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {timeOptions.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Times</p>
              <ul>
                {timeOptions.map((option) => {
                  const index = flatIndex++
                  return (
                    <li key={`commit-${option.kind}-${option.label}-${index}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setSelected(index)}
                        onClick={() => activate(option, index)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          index === clamped ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                        )}
                      >
                        <span className="flex-1 truncate font-medium">{option.label}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{rowTime(option)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button
          type="button"
          size="sm"
          disabled={pending || !active}
          onClick={() => active && activate(active, clamped)}
          className="w-full"
        >
          {active?.action === 'open'
            ? `Open the ${active.label.toLowerCase()} form`
            : pending ? 'Adding...' : 'Add to day'}
        </Button>
      </form>
    </PanelShell>
  )
}
