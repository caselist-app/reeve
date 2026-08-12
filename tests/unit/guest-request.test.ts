import { describe, it, expect } from 'vitest'
import { parseGuestRequest, nextGuestQuestion } from '@/lib/comms/guest-request'

// Brief 52, step 6 (REE-133). The /guest parser is deterministic and has no
// model call: it pulls a name, an email and a ticket count out of whatever the
// crew member typed, and nextGuestQuestion says what is still missing. Both are
// pure, which is why they are unit tested here rather than through the flow.

describe('parseGuestRequest', () => {
  it('reads a full one-liner: name, email and a +N ticket count', () => {
    const parsed = parseGuestRequest('dave smith dave@gmail.com +2')
    expect(parsed.firstName).toBe('Dave')
    expect(parsed.lastName).toBe('Smith')
    expect(parsed.email).toBe('dave@gmail.com')
    // "+2" is Dave plus two, so three tickets in total.
    expect(parsed.numTickets).toBe(3)
  })

  it('reads a bare integer as the ticket total, not a plus-N', () => {
    const parsed = parseGuestRequest('dave smith 3')
    expect(parsed.numTickets).toBe(3)
  })

  it('finds an email sitting in the middle of the words', () => {
    const parsed = parseGuestRequest('dave dave@gmail.com smith')
    expect(parsed.email).toBe('dave@gmail.com')
    expect(parsed.firstName).toBe('Dave')
    expect(parsed.lastName).toBe('Smith')
  })

  it('puts the first word in first_name and the rest in last_name', () => {
    const parsed = parseGuestRequest('dave van dyke')
    expect(parsed.firstName).toBe('Dave')
    expect(parsed.lastName).toBe('Van Dyke')
  })

  it('leaves a field null when it was not typed', () => {
    const parsed = parseGuestRequest('dave smith')
    expect(parsed.email).toBeNull()
    expect(parsed.numTickets).toBeNull()
  })
})

describe('nextGuestQuestion', () => {
  // The state a fresh parse produces, so the two functions are tested together the
  // way the flow uses them.
  function stateFor(text: string) {
    const p = parseGuestRequest(text)
    return {
      firstName: p.firstName,
      lastName: p.lastName,
      emailResolved: p.email !== null,
      ticketsResolved: p.numTickets !== null,
      needsPass: false,
    }
  }

  it('asks for the email next once the name is in', () => {
    expect(nextGuestQuestion(stateFor('dave smith'))).toBe('email')
  })

  it('asks for the name when only a ticket count was sent', () => {
    expect(nextGuestQuestion(stateFor('+2'))).toBe('name')
  })

  it('asks for the tickets once name and email are in', () => {
    expect(nextGuestQuestion(stateFor('dave smith dave@gmail.com'))).toBe('tickets')
  })

  it('asks for the pass only when the requester is on the band', () => {
    const state = {
      firstName: 'Dave',
      lastName: 'Smith',
      emailResolved: true,
      ticketsResolved: true,
      needsPass: true,
    }
    expect(nextGuestQuestion(state)).toBe('pass')
    expect(nextGuestQuestion({ ...state, needsPass: false })).toBeNull()
  })
})
