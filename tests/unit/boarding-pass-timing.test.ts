import { describe, it, expect } from 'vitest'
import { boardingPassSendAt, SEND_HOURS_BEFORE_DEPARTURE } from '@/lib/comms/boarding-pass-timing'

// Pure and timezone-aware, so a unit test. Every expectation is a wall-clock fact
// in a real zone. London is UTC+1 in June (BST) and UTC+0 in January; Auckland is
// UTC+12 in June, which crosses the date line relative to UTC.

describe('boardingPassSendAt', () => {
  it('sends 6 hours before an afternoon departure, no cap needed', () => {
    // 14:00 local London (13:00Z) minus 6h = 08:00 local, past the quiet window.
    const sendAt = boardingPassSendAt('2030-06-15T13:00:00.000Z', 'Europe/London')
    expect(sendAt.toISOString()).toBe('2030-06-15T07:00:00.000Z') // 08:00 BST
  })

  it('leaves a 07:00 local send alone, the edge of the quiet window', () => {
    // 13:00 local London departure minus 6h = 07:00 local exactly.
    const sendAt = boardingPassSendAt('2030-06-15T12:00:00.000Z', 'Europe/London')
    expect(sendAt.toISOString()).toBe('2030-06-15T06:00:00.000Z') // 07:00 BST
  })

  it('caps a small-hours send to 20:00 the evening before departure', () => {
    // 08:00 local London departure minus 6h = 02:00 local, middle of the night.
    // Cap: 20:00 local on 14 June (19:00Z in BST).
    const sendAt = boardingPassSendAt('2030-06-15T07:00:00.000Z', 'Europe/London')
    expect(sendAt.toISOString()).toBe('2030-06-14T19:00:00.000Z')
  })

  it('caps a just-after-midnight departure to the prior evening, not the same one', () => {
    // 00:30 local London departure. 6h before is 18:30 the previous day, which is
    // itself in quiet hours? No: 18:30 is past 07:00, so no cap and it sends the
    // evening before naturally. This guards the anchor-on-departure-day choice.
    const sendAt = boardingPassSendAt('2030-06-14T23:30:00.000Z', 'Europe/London')
    expect(sendAt.toISOString()).toBe('2030-06-14T17:30:00.000Z') // 18:30 BST, 14 June
  })

  it('caps a 06:00 departure to the evening before, spanning the date boundary', () => {
    // 06:00 local minus 6h = 00:00 local on departure day, quiet. Cap to 20:00 the
    // day before.
    const sendAt = boardingPassSendAt('2030-06-15T05:00:00.000Z', 'Europe/London')
    expect(sendAt.toISOString()).toBe('2030-06-14T19:00:00.000Z')
  })

  it('applies the wall-clock cap in the tour timezone, not UTC', () => {
    // Auckland is UTC+12 in June. 09:00 local (21:00Z on 14 June) departure minus
    // 6h = 03:00 local on the 15th, quiet. Cap to 20:00 local on 14 June = 08:00Z.
    const sendAt = boardingPassSendAt('2030-06-14T21:00:00.000Z', 'Pacific/Auckland')
    expect(sendAt.toISOString()).toBe('2030-06-14T08:00:00.000Z')
  })

  it('handles the winter offset change for London', () => {
    // January: London is UTC+0. 14:00 local departure minus 6h = 08:00 local.
    const sendAt = boardingPassSendAt('2030-01-15T14:00:00.000Z', 'Europe/London')
    expect(sendAt.toISOString()).toBe('2030-01-15T08:00:00.000Z')
  })

  it('exports the lead constant it is built on', () => {
    expect(SEND_HOURS_BEFORE_DEPARTURE).toBe(6)
  })
})
