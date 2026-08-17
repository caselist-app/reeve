import { describe, it, expect } from 'vitest'
import {
  selectShowInfoVariant,
  selectCateringVariant,
  selectWrapVariant,
  resolveDayBlocks,
  type ShowInfoInput,
  type CateringInput,
  type WrapOnwardLeg,
  type DayBlockInput,
} from '@/lib/comms/blocks/select'

// lib/comms/blocks/select.ts says each selector is "pure and side-effect free
// so it is trivially unit-testable". This file is that test: no fixtures, no
// mocks, just the branch table each selector encodes.

function showInfo(over: Partial<ShowInfoInput> = {}): ShowInfoInput {
  return {
    load_in: null,
    soundcheck: null,
    changeover: null,
    headliner_on: null,
    ...over,
  }
}

function catering(over: Partial<CateringInput> = {}): CateringInput {
  return {
    catering_type: 'none',
    catering_breakfast_start: null,
    ...over,
  }
}

function onwardLeg(over: Partial<WrapOnwardLeg> = {}): WrapOnwardLeg {
  return {
    mode: 'flight',
    destination: 'JFK',
    depart_at: '2026-06-15T09:00:00.000Z',
    ...over,
  }
}

function dayBlockInput(over: Partial<DayBlockInput> = {}): DayBlockInput {
  return {
    load_in: null,
    soundcheck: null,
    changeover: null,
    headliner_on: null,
    catering_type: 'none',
    catering_breakfast_start: null,
    catering_lunch_start: null,
    catering_dinner_start: null,
    curfew: null,
    ...over,
  }
}

describe('selectShowInfoVariant', () => {
  it('returns null when there is neither a load_in nor a headliner_on', () => {
    expect(selectShowInfoVariant(showInfo())).toBeNull()
  })

  it('returns a variant when only load_in is set (an OR of the two, not an AND)', () => {
    // The guard is `!d.load_in && !d.headliner_on`, an AND of NOTs, so either
    // field alone is enough to pass it.
    expect(selectShowInfoVariant(showInfo({ load_in: '10:00' }))).not.toBeNull()
  })

  it('returns a variant when only headliner_on is set, with no load_in at all', () => {
    expect(selectShowInfoVariant(showInfo({ headliner_on: '21:00' }))).not.toBeNull()
  })

  it('returns full when both soundcheck and changeover are set', () => {
    const result = selectShowInfoVariant(
      showInfo({ load_in: '10:00', soundcheck: '17:00', changeover: '20:00' })
    )
    expect(result).toBe('full')
  })

  it('returns no_soundcheck when changeover is set but soundcheck is not', () => {
    const result = selectShowInfoVariant(
      showInfo({ load_in: '10:00', soundcheck: null, changeover: '20:00' })
    )
    expect(result).toBe('no_soundcheck')
  })

  it('returns no_changeover when soundcheck is set but changeover is not', () => {
    const result = selectShowInfoVariant(
      showInfo({ load_in: '10:00', soundcheck: '17:00', changeover: null })
    )
    expect(result).toBe('no_changeover')
  })

  it('returns minimal when neither soundcheck nor changeover is set', () => {
    const result = selectShowInfoVariant(
      showInfo({ load_in: '10:00', soundcheck: null, changeover: null })
    )
    expect(result).toBe('minimal')
  })
})

describe('selectCateringVariant', () => {
  it('returns buyout regardless of breakfast_start, since buyout is checked first', () => {
    expect(
      selectCateringVariant(catering({ catering_type: 'buyout', catering_breakfast_start: '08:00' }))
    ).toBe('buyout')
    expect(
      selectCateringVariant(catering({ catering_type: 'buyout', catering_breakfast_start: null }))
    ).toBe('buyout')
  })

  it('returns null when catering_type is none', () => {
    expect(selectCateringVariant(catering({ catering_type: 'none' }))).toBeNull()
  })

  it('returns full when provided and breakfast_start is set', () => {
    const result = selectCateringVariant(
      catering({ catering_type: 'provided', catering_breakfast_start: '08:00' })
    )
    expect(result).toBe('full')
  })

  it('returns no_breakfast when provided and breakfast_start is null', () => {
    const result = selectCateringVariant(
      catering({ catering_type: 'provided', catering_breakfast_start: null })
    )
    expect(result).toBe('no_breakfast')
  })
})

describe('selectWrapVariant', () => {
  it('returns null when neither curfew nor an onward leg is present', () => {
    expect(selectWrapVariant(null, null)).toBeNull()
  })

  it('returns static when curfew is set and there is no onward leg', () => {
    expect(selectWrapVariant('01:00', null)).toBe('static')
  })

  it('returns travel when an onward leg is present, curfew set', () => {
    expect(selectWrapVariant('01:00', onwardLeg())).toBe('travel')
  })

  it('returns travel when an onward leg is present even without curfew', () => {
    // `return onwardLeg ? 'travel' : 'static'` runs after the initial null
    // guard, so a truthy onwardLeg wins regardless of curfew. This is a real
    // branch, not a redundant case: curfew null plus onwardLeg set never hits
    // the early null return because onwardLeg alone keeps it truthy.
    expect(selectWrapVariant(null, onwardLeg())).toBe('travel')
  })
})

describe('resolveDayBlocks', () => {
  it('returns an empty array, with no opener, when nothing fires', () => {
    expect(resolveDayBlocks(dayBlockInput(), null)).toEqual([])
  })

  it('prepends opener when exactly one block fires', () => {
    const input = dayBlockInput({ catering_type: 'buyout' })
    expect(resolveDayBlocks(input, null)).toEqual(['opener', 'catering'])
  })

  it('orders blocks as opener, show_information, catering, wrap when all three fire', () => {
    const input = dayBlockInput({
      load_in: '10:00',
      soundcheck: '17:00',
      changeover: '20:00',
      catering_type: 'buyout',
      curfew: '01:00',
    })
    expect(resolveDayBlocks(input, onwardLeg())).toEqual([
      'opener',
      'show_information',
      'catering',
      'wrap',
    ])
  })
})
