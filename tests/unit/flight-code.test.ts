import { describe, it, expect } from 'vitest'
import { detectFlightCode } from '@/lib/utils/flight-code'

describe('detectFlightCode', () => {
  it('detects a bare code, upper-casing the airline part', () => {
    expect(detectFlightCode('CX150')).toEqual({ code: 'CX', number: '150' })
    expect(detectFlightCode('cx150')).toEqual({ code: 'CX', number: '150' })
  })

  it('detects a code with a space or a dash between the airline and the number', () => {
    expect(detectFlightCode('cx 150')).toEqual({ code: 'CX', number: '150' })
    expect(detectFlightCode('CX-150')).toEqual({ code: 'CX', number: '150' })
  })

  it('accepts a 3-letter airline code', () => {
    expect(detectFlightCode('BAW123')).toEqual({ code: 'BAW', number: '123' })
  })

  it('is anchored: trailing or leading text means it is not a bare code', () => {
    expect(detectFlightCode('CX150 3pm')).toBeNull()
    expect(detectFlightCode('flight CX150')).toBeNull()
  })

  it('rejects input with no digits or no letters', () => {
    expect(detectFlightCode('CX')).toBeNull()
    expect(detectFlightCode('150')).toBeNull()
  })
})
