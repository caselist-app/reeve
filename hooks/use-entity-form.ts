'use client'

import { useTransition, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

// The shape every server action in lib/actions returns. Widened so any
// action's return type is accepted as long as it carries `error`.
export interface EntityActionResult {
  error: string | null
}

interface UseEntityFormOptions<TResult extends EntityActionResult> {
  // Reads the submitted FormData and calls the server action. Read fields
  // with readForm() (lib/forms/read-form.ts) instead of fd.get(name) as
  // string casts. May do async work before calling the action (e.g. a drive
  // form resolving drive time first): the only requirement is the returned
  // promise resolves to something with `error`.
  action: (fd: FormData) => Promise<TResult>
  // Called once the action resolves with error: null. Add forms use this to
  // close the panel; edit panels typically omit it and rely on `saved`.
  onSuccess?: (result: TResult) => void
  // Two refresh strategies, and the split is deliberate. Do not "fix" it by
  // passing true everywhere: that double-renders.
  //
  // Add forms pass true. They create a new timeline item and refresh on the
  // client so the server-rendered timeline picks it up.
  //
  // Edit panels leave it false and rely on their server action calling
  // revalidatePath on the schedule route instead. updateDayEvent,
  // updateHotelStay, updateTransportSegment and updateDaySheet all do.
  // If you write a new edit panel, the action is where the refresh belongs,
  // and forgetting it there is silent: the panel says "Saved." and the
  // timeline keeps the old value until a navigation. That was a live bug in
  // updateDaySheet until 2026-08-04.
  refreshOnSuccess?: boolean
}

interface UseEntityFormResult {
  submit: (e: FormEvent<HTMLFormElement>) => void
  pending: boolean
  error: string | null
  saved: boolean
}

// Owns the boilerplate every add form and edit panel in components/schedule
// used to hand-roll: useTransition, an error useState, a submit handler that
// preventDefaults, an `if (result.error)` branch, and the success path
// (router.refresh() plus a callback, or a "Saved." flash). See CLAUDE.md /
// COMPONENTS.md R3: every form that calls a server action goes through this
// hook. Never hand-roll useTransition plus error state plus router.refresh().
export function useEntityForm<TResult extends EntityActionResult>({
  action,
  onSuccess,
  refreshOnSuccess = false,
}: UseEntityFormOptions<TResult>): UseEntityFormResult {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await action(fd)
      if (result.error) {
        setError(result.error)
        return
      }
      setError(null)
      setSaved(true)
      if (refreshOnSuccess) router.refresh()
      onSuccess?.(result)
    })
  }

  return { submit, pending, error, saved }
}
