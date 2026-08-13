'use client'

import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

// The one confirm dialog in the app. See COMPONENTS.md and Brief 51 for why:
// eight hand-rolled AlertDialogs each re-decided pending state, error handling
// and close-on-success, and only one of them got the synchronous
// preventDefault right. This is the primitive; check:conventions rule 14
// keeps it the only file that imports components/ui/alert-dialog.

export type ConfirmDialogStatus = 'idle' | 'pending' | 'closed' | 'error'

export interface ConfirmDialogState {
  status: ConfirmDialogStatus
  message: string | null
}

export type ConfirmDialogAction =
  | { type: 'confirm' }
  | { type: 'resolve'; result: string | null }
  | { type: 'open' }

export const initialConfirmDialogState: ConfirmDialogState = {
  status: 'idle',
  message: null,
}

// Pure so it can be tested without rendering anything: this repo has no
// @testing-library and no jsdom/happy-dom.
export function confirmDialogReducer(
  state: ConfirmDialogState,
  action: ConfirmDialogAction,
): ConfirmDialogState {
  switch (action.type) {
    case 'confirm':
      if (state.status === 'pending') return state
      return { status: 'pending', message: null }
    case 'resolve':
      if (state.status !== 'pending') return state
      return action.result === null
        ? { status: 'closed', message: null }
        : { status: 'error', message: action.result }
    case 'open':
      return initialConfirmDialogState
    default:
      return state
  }
}

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  // Computed by the caller per state, so a title can change between e.g.
  // loading and ready.
  title: string
  description: React.ReactNode

  // Interactive body content: a checkbox, a type-the-name input. The caller
  // owns its state, so onConfirm closes over the value and no generic or
  // callback argument is needed here.
  children?: React.ReactNode

  confirmLabel: string
  pendingLabel: string
  cancelLabel?: string

  // Red by default: most callers destroy something.
  destructive?: boolean

  // Gate the confirm without hiding it.
  confirmDisabled?: boolean

  // Remove the confirm button entirely, leaving Cancel alone. Not the same
  // as confirmDisabled.
  hideConfirm?: boolean

  onConfirm: () => Promise<string | null>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  confirmDisabled,
  hideConfirm,
  onConfirm,
}: ConfirmDialogProps) {
  const [state, dispatch] = React.useReducer(confirmDialogReducer, initialConfirmDialogState)

  // Reset error and pending state on every open, so a dialog reopened after a
  // failure does not show the last failure's message.
  React.useEffect(() => {
    if (open) dispatch({ type: 'open' })
  }, [open])

  React.useEffect(() => {
    if (state.status === 'closed') onOpenChange(false)
  }, [state.status, onOpenChange])

  const pending = state.status === 'pending'

  async function handleConfirm(e: React.MouseEvent<HTMLButtonElement>) {
    // Radix's composeEventHandlers checks event.defaultPrevented
    // synchronously the instant this handler returns, so preventDefault has
    // to run before the await. Calling it later does nothing and the dialog
    // closes anyway.
    e.preventDefault()
    if (pending) return
    dispatch({ type: 'confirm' })
    const result = await onConfirm()
    dispatch({ type: 'resolve', result })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {state.status === 'error' && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          {!hideConfirm && (
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={pending || confirmDisabled}
              className={cn(
                destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              )}
            >
              {pending ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
