import { describe, it, expect } from 'vitest'
import {
  confirmDialogReducer,
  initialConfirmDialogState,
  type ConfirmDialogState,
} from '@/components/ui/confirm-dialog'

// The component can't be rendered (no @testing-library, no jsdom/happy-dom in
// this repo), so the state machine is a pure reducer in the same file and
// this pins its four transitions directly.

describe('confirmDialogReducer', () => {
  it('moves from idle to pending on confirm', () => {
    const next = confirmDialogReducer(initialConfirmDialogState, { type: 'confirm' })
    expect(next.status).toBe('pending')
  })

  it('moves from pending to closed on a null result', () => {
    const pending: ConfirmDialogState = { status: 'pending', message: null }
    const next = confirmDialogReducer(pending, { type: 'resolve', result: null })
    expect(next.status).toBe('closed')
  })

  it('moves from pending to error and stays open on a string result', () => {
    const pending: ConfirmDialogState = { status: 'pending', message: null }
    const next = confirmDialogReducer(pending, {
      type: 'resolve',
      result: 'Travel and hotel assignments must be removed first.',
    })
    expect(next.status).toBe('error')
    expect(next.message).toBe('Travel and hotel assignments must be removed first.')
  })

  it('returns to idle with the message cleared when reopened after an error', () => {
    const errored: ConfirmDialogState = { status: 'error', message: 'Something went wrong.' }
    const next = confirmDialogReducer(errored, { type: 'open' })
    expect(next.status).toBe('idle')
    expect(next.message).toBeNull()
  })

  it('ignores a second confirm while already pending', () => {
    const pending: ConfirmDialogState = { status: 'pending', message: null }
    const next = confirmDialogReducer(pending, { type: 'confirm' })
    expect(next).toBe(pending)
  })

  it('ignores a resolve that arrives outside pending', () => {
    const next = confirmDialogReducer(initialConfirmDialogState, { type: 'resolve', result: null })
    expect(next).toBe(initialConfirmDialogState)
  })
})
